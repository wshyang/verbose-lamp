import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ResourceMonitor, parseMemInfo, parseSwapUsage, parseVmStat } from './resourceMonitor.js';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** macOS 16 KiB-page `vm_stat`, abridged to the lines the parser owns plus neighbours. */
const VM_STAT = [
  'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
  'Pages free:                               173812.',
  'Pages active:                            1048576.',
  'Pages speculative:                        109691.',
  'Pages wired down:                         500123.',
  'Pages purgeable:                          135771.',
  '"Pageouts":                                    0.',
].join('\n');

describe('parseVmStat', () => {
  it('reads available memory as (free + speculative + purgeable) pages', () => {
    // (173812 + 109691 + 135771) × 16384 — computed by hand, not by the parser's shape.
    expect(parseVmStat(VM_STAT)).toEqual({ pageSizeBytes: 16384, availableBytes: 6_869_385_216 });
  });

  it('survives a vm_stat that omits the purgeable line — the plan treats it as zero', () => {
    const withoutPurgeable = VM_STAT.split('\n')
      .filter((line) => !line.startsWith('Pages purgeable:'))
      .join('\n');
    expect(parseVmStat(withoutPurgeable)?.availableBytes).toBe((173812 + 109691) * 16384);
  });

  it('returns null for text that is not vm_stat, rather than inventing a number', () => {
    expect(parseVmStat('this is not vm_stat')).toBeNull();
    expect(parseVmStat('Pages free: 1.')).toBeNull();
  });
});

describe('parseSwapUsage', () => {
  it('reads megabytes of swap in use', () => {
    expect(parseSwapUsage('vm.swapusage: total = 6144.00M  used = 122.50M  free = 6021.50M (encrypted)')).toBe(
      128_450_560,
    );
  });

  it('reads the other units sysctl can print', () => {
    expect(parseSwapUsage('vm.swapusage: total = 4.00G  used = 2.00G  free = 2.00G')).toBe(2 * GiB);
    expect(parseSwapUsage('vm.swapusage: total = 1024K  used = 0K  free = 1024K')).toBe(0);
  });

  it('returns null when the line is missing', () => {
    expect(parseSwapUsage('vm.swapusage: total = 6144.00M')).toBeNull();
  });
});

describe('parseMemInfo', () => {
  it('reads MemAvailable and swap in use from /proc/meminfo text', () => {
    const memInfo = [
      'MemTotal:       16384000 kB',
      'MemFree:         1234567 kB',
      'MemAvailable:    7654321 kB',
      'SwapTotal:       1048576 kB',
      'SwapFree:        1047552 kB',
    ].join('\n');
    expect(parseMemInfo(memInfo)).toEqual({ availableBytes: 7_838_024_704, swapUsedBytes: 1 * MiB });
  });

  it('returns null without MemAvailable — an old kernel is a loud miss, not a guess', () => {
    expect(parseMemInfo('MemTotal: 100 kB\nMemFree: 50 kB')).toBeNull();
  });
});

describe('ResourceMonitor', () => {
  it('samples on an interval, keeps the latest, and writes every line to the telemetry file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scale-monitor-'));
    let calls = 0;
    let clock = 1_000;
    const monitor = new ResourceMonitor({
      // The third read fails: a monitor hiccup must not end the run (plan §5).
      sources: {
        async read() {
          calls += 1;
          if (calls === 3) throw new Error('vm_stat vanished');
          return { availableBytes: 10 * GiB, swapUsedBytes: 0 };
        },
      },
      intervalMs: 5,
      telemetryPath: join(dir, 'telemetry.jsonl'),
      now: () => (clock += 1_000),
    });
    const seen: number[] = [];
    const unsubscribe = monitor.onSample((sample) => seen.push(sample.availableBytes));

    await monitor.start();
    await new Promise((resolve) => setTimeout(resolve, 40));
    await monitor.stop();
    unsubscribe();

    expect(calls).toBeGreaterThanOrEqual(3);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(monitor.latest?.availableBytes).toBe(10 * GiB);
    expect(monitor.latest?.load1).toBeGreaterThanOrEqual(0);
    expect(monitor.latest?.cores).toBeGreaterThanOrEqual(1);

    const lines = (await readFile(join(dir, 'telemetry.jsonl'), 'utf8')).trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { kind: string; t: number };
      expect(['sample', 'sample-error', 'event']).toContain(parsed.kind);
      expect(parsed.t).toBeGreaterThan(0);
    }
    expect(lines.some((line) => line.includes('sample-error')), 'the failed read is recorded, not swallowed').toBe(
      true,
    );
  });

  it('fails loudly when even the first sample cannot be taken — a preflight failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scale-monitor-'));
    const monitor = new ResourceMonitor({
      sources: {
        async read() {
          throw new Error('no vm_stat here');
        },
      },
      telemetryPath: join(dir, 'telemetry.jsonl'),
      now: () => 1,
    });
    await expect(monitor.start()).rejects.toThrow('no vm_stat here');
  });

  it('logEvent lands in the same telemetry file, stamped by the same clock', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scale-monitor-'));
    const monitor = new ResourceMonitor({
      sources: { async read() { return { availableBytes: 1, swapUsedBytes: 0 }; } },
      intervalMs: 1_000,
      telemetryPath: join(dir, 'telemetry.jsonl'),
      now: () => 42,
    });
    await monitor.logEvent({ event: 'spawn', count: 5 });
    const lines = (await readFile(join(dir, 'telemetry.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'event', t: 42, event: 'spawn', count: 5 });
  });
});
