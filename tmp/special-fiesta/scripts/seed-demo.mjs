#!/usr/bin/env node
/**
 * Demo data for a walkthrough — `npm run seed:demo` with the API already running.
 *
 * It drives the real HTTP API with real sessions (no direct database writes), so whatever it
 * produces is reachable by a human doing the same clicks. Safe to re-run: every step tolerates
 * "already exists" responses (chat and announcements will accumulate on re-runs; use a fresh
 * database for a pristine demo).
 *
 * The shape of the day it builds (so the app looks LIVED IN, not freshly installed):
 *   - 135 named participants, every one signing in with PIN 1000: the 120 recorded
 *     onboardings (scripts/demo-participants.dump.json, photos worn) plus fifteen
 *     supplemental named sign-ups (scripts/demo-supplemental-participants.json, drawn
 *     avatars — they were never recorded, so they have no photo sprite). Sign-up order
 *     carries the day's cluster totals, and Participant 001-094 sit on team rosters.
 *   - 12 Kallang-named teams whose rosters follow the team sign-up table; a roster of
 *     nine or more is the working definition of a complete team, which makes seven.
 *   - an UNSTARTED Captain's ball draft at flat 30/20/10, entered with those seven
 *     complete teams and NO saved format. The field may still land anywhere from
 *     seven to twelve teams, so the Start shape belongs to a Simulator rehearsal in
 *     the console, not to this seed — Start remains the walkthrough's own click.
 *   - the five fringe stations of the programme with three rounds of history each
 *     and a fresh round left open for walk-up scans; the windows overlap so a dozen
 *     people complete the four-station passport and visibly earn the ADR-176 bonus;
 *     Netball Shooting Challenge's plan runs three extra
 *     solo windows for one returning regular, so her passport carries a stack of
 *     strikes at a single station (ADR-261)
 *   - a photo wall with captioned uploads, likes and one reported photo
 *   - three staff announcements
 *   - the day's real programme in the Agenda segment, with a live now/next
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.PSD_API_TARGET ?? 'http://127.0.0.1:8787';
const SUPERADMIN = {
  username: process.env.SUPERADMIN_INITIAL_USERNAME ?? 'superadmin',
  passcode: process.env.SUPERADMIN_INITIAL_PASSCODE ?? '4242',
};

/**
 * ADR-040 — the recorded crowd is not invented here: it is the recorded dump of
 * real onboardings (sign-up screen, photo studio, 128x128 sprite and all), made by
 * `npm run demo:record`. This script replays what that server held, then signs up
 * the supplemental named participants the day's real sign-up count needs (ADR-314).
 */
const ROOT = dirname(fileURLToPath(import.meta.url));
const DUMP = join(ROOT, 'demo-participants.dump.json');
const SUPPLEMENTAL = join(ROOT, 'demo-supplemental-participants.json');
const INGEST = join(ROOT, '..', 'images', 'ingest');
/**
 * ADR-326 — the sign-up table itself (cluster totals, the twelve teams' roster segments)
 * lives in demo-team-plan.json, not inline: the API size-loop suite replays this same day at
 * seven to twelve teams, and a table copied into a test would drift from the day it seeds.
 */
const PLAN = JSON.parse(readFileSync(join(ROOT, 'demo-team-plan.json'), 'utf8'));

/** ADR-314 — every named demo participant signs in with the same PIN. */
const DEMO_PIN = '1000';
/** The day's real sign-up count: 120 recorded + 15 supplemental. */
const DEMO_CROWD_SIZE = 135;

class Session {
  constructor(label) {
    this.label = label;
    this.cookie = null;
  }

  async call(method, path, body) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    return { status: response.status, payload };
  }

  /** Multipart upload (the photo wall): FormData sets its own content-type boundary. */
  async upload(path, form) {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: this.cookie ? { cookie: this.cookie } : {},
      body: form,
    });
    const text = await response.text();
    return { status: response.status, payload: text ? JSON.parse(text) : null };
  }
}

function report(step, result) {
  const ok = result.status < 400;
  const detail = ok ? '' : ` — ${result.payload?.error?.message ?? result.status}`;
  console.log(`${ok ? '·' : '!'} ${step}${detail}`);
  return result.payload;
}

/** ADR-286 — the venue's courts. Idempotent: a court whose number is taken is already there. */
async function ensureCourts(admin) {
  for (const court of [
    { courtNumber: 1, label: 'Court 1' },
    { courtNumber: 2, label: 'Court 2' },
    { courtNumber: 3, label: 'Court 3' },
  ]) {
    const result = await admin.call('POST', '/api/admin/tournament/courts', court);
    if (result.status === 409) continue;
    report(`court ${court.label}`, result);
  }
}

/**
 * ADR-314 — the demo's tournament: an UNSTARTED draft created through the same
 * `POST /api/admin/tournament` the console's API client sends, entered with the
 * seven complete teams (roster of nine or more) and deliberately NO saved setup.
 * Nothing is started: no scheduler row, no stages, no matches.
 *
 * No format is saved because the field is not settled: the day may field anywhere
 * from seven to twelve teams, and each count wants its own rehearsal. The console's
 * Simulator (Tournament -> Simulator) plans a field of any size on the venue's
 * courts; the operator varies Teams there, picks the shape that fits the clock,
 * and only then saves a Start format on the draft. Seeding one count's pipeline
 * here would pretend that decision is already made.
 * Idempotent like the courts: a 409 is a draft already there.
 */
async function ensureTournamentDraft(admin, teams) {
  const entered = teams.filter((team) => team.size >= COMPLETE_TEAM_MIN);
  if (entered.length === 0) {
    console.log('! tournament draft skipped — no complete teams to enter');
    return;
  }
  const result = await admin.call('POST', '/api/admin/tournament', {
    name: 'Captain’s ball',
    kind: 'captains_ball',
    winPoints: 30,
    drawPoints: 20,
    lossPoints: 10,
    teamIds: entered.map((team) => team.id),
    // No `setup`: the Start format is the operator's decision, rehearsed in the Simulator.
  });
  if (result.status === 409) {
    console.log('· tournament draft already there — complete teams entered, no format saved');
    return;
  }
  report(`tournament draft Captain’s ball (${entered.length} complete teams entered, no format saved)`, result);
  console.log('· planning: rehearse 7-12 teams in Tournament -> Simulator before choosing a Start format');
}

/** A timestamp `minutes` ago, so the recorded morning reads like a morning. */
function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * Pixel dimensions straight from the file header — PNG IHDR or the first JPEG SOF frame.
 * The upload route requires them (the gallery lays tiles out before the bytes arrive),
 * and the seed has no image library to ask.
 */
function imageSizeOf(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    // Any SOF0–SOF15 frame (skipping DHT/DAC/RST which share the range's gaps).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return { width: 1024, height: 768 };
}

async function main() {
  const admin = new Session('superadmin');
  const signedIn = await admin.call('POST', '/api/auth/superadmins/signin', SUPERADMIN);
  if (signedIn.status !== 200) {
    console.error('Cannot sign in as superadmin. Is the API running with the right passcode?');
    process.exit(1);
  }
  console.log('· signed in as superadmin');

  /*
   * The real Active Day 2026 fringe settings (docs/active-day-2026-feature-assessment.md §1, §2b).
   * ADR-270 — the tournament's rates now belong to the tournament; the demo draft carries its own (ADR-314).
   */
  report('point config', await admin.call('PUT', '/api/admin/point-config', {
    // ADR-116 — taking part scores even without placing.
    fringeParticipationPoints: 5,
    /*
     * ADR-176 — the passport bonus, ON in the demo. It defaults to 0 because no event should
     * pay a bonus nobody configured, but a demo with it off can never show the feature, and
     * the station windows below are arranged so roughly a dozen people actually earn it.
     */
    fringePassportBonusPoints: 20,
    fringePassportStations: 4,
  }));

  // Facilitator accounts (court1/fringe1/fringe2) are tier 2 — seed-default.sql — and
  // already exist on any booted server (ADR-102); this script only signs in as them.
  const activities = await ensureActivities(admin);
  const swagStation = await ensureSwagStation(admin);
  await ensureAgenda(admin);
  const participants = await signUpCrowd();
  const teams = await buildTeams(participants);
  /*
   * ADR-314 — a draft, never a started tournament: only the complete teams are
   * entered and no Start format is saved, so the console's Simulator stays the
   * place to rehearse the field landing anywhere from seven to twelve teams.
   * ADR-286 — the venue's three courts exist, so the Simulator plans on them
   * and Start has somewhere to put the day.
   */
  await ensureCourts(admin);
  await ensureTournamentDraft(admin, teams);
  await runStations(activities, participants);
  await fillSocialRoom(participants);
  await fillTeamRooms(participants, teams);
  await fillPhotoWall(participants);
  await postAnnouncements(admin);

  await runSwagCounter(swagStation, participants);

  const first = participants[0];
  console.log('\nDemo data ready.');
  console.log(`  participant: ${first?.nickname ?? '?'} / ${DEMO_PIN}   (every seeded participant uses PIN ${DEMO_PIN})`);
  console.log('               recorded names: scripts/demo-personas.json; supplemental: scripts/demo-supplemental-participants.json');
  console.log('  facilitator: court1 / 1111, fringe1 / 1111, fringe2 / 1111');
  console.log(`  superadmin:  ${SUPERADMIN.username} / ${SUPERADMIN.passcode}`);
}

async function ensureActivities(admin) {
  /*
   * ADR-312 — the five fringe stations in the programme, renamed wholesale for the
   * revised station line-up. Every station carries one generic completion tier: a flat,
   * deliberately unglamorous 30 points, chosen as DEMO COLOUR so the leaderboard
   * still has something sane to show. It is not a published price or a ruling.
   *
   * Five stations is itself load-bearing: the passport needs four DISTINCT ones to complete,
   * so a corpus of three could never demonstrate ADR-176 at all.
   */
  const completionTier = [{ label: 'Completed', points: 30 }];
  const activitySpecs = [
    { activityName: 'Indoor Bocce Challenge', awardTiers: completionTier },
    { activityName: 'Netball Shooting Challenge', awardTiers: completionTier },
    { activityName: 'Hula Hoop Hero', awardTiers: completionTier },
    { activityName: 'Jump Rope Challenge', awardTiers: completionTier },
    { activityName: 'Giant Ball Slalom', awardTiers: completionTier },
  ];
  const activities = [];
  for (const spec of activitySpecs) {
    const created = report(`activity ${spec.activityName}`, await admin.call('POST', '/api/admin/activities', spec));
    if (created?.activity) activities.push(created.activity);
  }
  if (activities.length === 0) {
    const listed = await admin.call('GET', '/api/admin/activities');
    activities.push(...(listed.payload?.items ?? []));
  }
  return activities;
}

/**
 * ADR-177 — the day's programme, as supplied for the new venue's Active Day.
 *
 * The date is part of the run sheet: 5 November 2026. Times are anchored to that
 * Singapore date rather than to the seed machine's "today", so the demo carries the
 * event as scheduled — arrival from noon, Captain's Ball from 13:10, activities
 * concluding at 15:00 and the close at 15:50. "Activities conclude" is a moment,
 * not a block, so it carries a start and no end.
 */
const PROGRAMME = [
  ['12:00', '12:30', 'Arrival and registration', null, null],
  ['12:30', '12:50', 'Mass yoga warm-up', null, null],
  ['12:50', '13:00', 'Opening speech', null, null],
  ['13:00', '13:10', 'Programme briefing and move to activities', null, null],
  ['13:10', '15:00', 'Captain’s Ball tournament and fringe activities', null, null],
  ['15:00', null, 'Activities conclude', null, null],
  ['15:05', '15:20', 'Exhibition match: SMT versus the winning Captain’s Ball team', null, null],
  ['15:20', '15:25', 'Gather for the closing programme', null, null],
  ['15:25', '15:35', 'Closing speech', null, null],
  ['15:35', '15:45', 'Prize presentation', null, null],
  ['15:45', '15:50', 'Group photograph and event close', null, null],
];

async function ensureAgenda(admin) {
  const existing = await admin.call('GET', '/api/admin/agenda');
  if ((existing.payload?.items ?? []).length > 0) {
    console.log('· programme already seeded');
    return;
  }
  let added = 0;
  for (const [start, end, title, location, detail] of PROGRAMME) {
    const created = await admin.call('POST', '/api/admin/agenda', {
      startsAt: atClock(start),
      endsAt: atClock(end),
      title,
      location,
      detail,
    });
    if (created.status < 400) added += 1;
    else report(`agenda ${title}`, created);
  }
  console.log(`· programme: ${added} items`);
}

/**
 * `HH:MM` on the event's own date — 5 November 2026 in Singapore (UTC+8) — as the
 * ISO instant the route takes. Null stays null. The date is fixed rather than read
 * from the seed machine's clock: the run sheet belongs to that day, and a seed run
 * on any other date must not quietly move the event.
 */
const EVENT_UTC_OFFSET_HOURS = 8;

function atClock(clock) {
  if (!clock) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 5, hours - EVENT_UTC_OFFSET_HOURS, minutes, 0, 0)).toISOString();
}

/** ADR-110 — the swag counter: items with per-round allowances, fringe's twin. */
async function ensureSwagStation(admin) {
  const created = report(
    'swag station Goodie Bag Counter',
    await admin.call('POST', '/api/admin/swag-stations', {
      stationName: 'Goodie Bag Counter',
      items: [
        { label: 'Tote bag', limit: 1 },
        { label: 'Sticker pack', limit: 2 },
        { label: 'Ice pop', limit: 1 },
      ],
    }),
  );
  if (created?.station) return created.station;
  const listed = await admin.call('GET', '/api/admin/swag-stations');
  return (listed.payload?.items ?? [])[0] ?? null;
}

/** The counter opens and hands the first wave of goodies out. */
async function runSwagCounter(swagStation, participants) {
  if (!swagStation) return;
  const marshal = new Session('fringe2');
  await marshal.call('POST', '/api/auth/facilitators/signin', { username: 'fringe2', passcode: '1111' });
  const opened = await marshal.call('POST', `/api/swag/stations/${swagStation.id}/rounds`, {});
  const round = opened.payload?.round;
  if (!round) return;
  const labels = ['Sticker pack', 'Tote bag', 'Ice pop'];
  let handed = 0;
  for (const [index, participant] of participants.slice(20, 32).entries()) {
    const claimed = await marshal.call('POST', '/api/swag/claims', {
      nickname: participant.nickname,
      roundId: round.id,
      itemLabel: labels[index % labels.length],
      clientClaimUuid: crypto.randomUUID(),
    });
    if (claimed.status < 400) handed += 1;
  }
  console.log(`· swag: round ${round.roundNumber} open at Goodie Bag Counter, ${handed} items handed out`);
}

/**
 * ADR-314 — the day's sign-up shape, in sign-up order. In demo-team-plan.json,
 * `clusterSignups` is the cluster table
 * (code, total sign-ups): the event's own cluster names ride on the catalogue's
 * codes — Comms & Engagement is `Comms`, Cumulus/ACE is `Cumulus`, HRPS/HRMS is `HRPS`,
 * SPR/IR is `SPR`, and CentEx / HI join the seeded catalogue. `teams` is the team
 * table: Kallang-named teams in order, each a list of (cluster, count) roster segments
 * covering Participant 001-094. A roster of nine or more reads as a complete team —
 * the reading of the table that makes seven teams complete.
 *
 * The two tables disagree in exactly one place, and the team table wins it: PSC Sect
 * shows one total sign-up (none in the tournament) yet fields the three-person
 * Team 09. Those three are seeded as PSC Sect, so PSC Sect carries three in the demo
 * and the last two non-roster sign-ups (one ServiceSG, one SPR) are the ones the
 * 135 total cannot also hold. Every other cluster lands exactly on its table total.
 */
const CLUSTER_SIGNUPS = PLAN.clusterSignups;
const TEAM_PLAN = PLAN.teams;

const COMPLETE_TEAM_MIN = PLAN.completeTeamMin;

/**
 * One cluster code per sign-up position (135 of them): the roster segments first
 * (Participant 001-094, in team order), then the remaining clusters' totals filled
 * in the cluster table's order until the 135 run out — the PSC Sect reconciliation
 * above is the only place the fill stops early.
 */
function buildSignupClusters() {
  const rosterClusters = TEAM_PLAN.flatMap((team) =>
    team.segments.flatMap(([cluster, count]) => Array.from({ length: count }, () => cluster)),
  );
  const rosterCounts = new Map();
  for (const cluster of rosterClusters) rosterCounts.set(cluster, (rosterCounts.get(cluster) ?? 0) + 1);
  const others = [];
  const openSlots = DEMO_CROWD_SIZE - rosterClusters.length;
  for (const [cluster, total] of CLUSTER_SIGNUPS) {
    const missing = Math.max(0, total - (rosterCounts.get(cluster) ?? 0));
    for (let i = 0; i < missing && others.length < openSlots; i += 1) others.push(cluster);
    if (others.length >= openSlots) break;
  }
  return [...rosterClusters, ...others];
}

const SIGNUP_CLUSTERS = buildSignupClusters();

async function signUpCrowd() {
  const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
  const supplemental = JSON.parse(readFileSync(SUPPLEMENTAL, 'utf8'));
  // Sign-up order is roster order: recorded onboardings first (Participant 001-120),
  // then the supplemental named sign-ups (Participant 121-135).
  const crowd = [...dump.participants, ...supplemental.participants];
  const participants = [];
  for (const [index, row] of crowd.entries()) {
    const clusterCode = SIGNUP_CLUSTERS[index];
    if (!clusterCode) {
      console.log(`! no cluster planned for sign-up position ${index + 1} (${row.nickname}) — skipped`);
      continue;
    }
    const session = new Session(row.nickname);
    const created = await session.call('POST', '/api/auth/participants/signup', {
      nickname: row.nickname,
      pin: DEMO_PIN,
      clusterCode,
      gender: row.gender,
      avatarVariant: row.avatarVariant,
      avatarLook: row.avatarLook,
      // The photo sprite exactly as the studio produced it during the recording.
      // Supplemental sign-ups were never recorded, so they carry none and the
      // drawn avatar shows instead.
      ...(row.avatarPhoto ? { avatarPhoto: row.avatarPhoto } : {}),
    });
    if (created.status === 409) {
      await session.call('POST', '/api/auth/participants/signin', {
        nickname: row.nickname,
        pin: DEMO_PIN,
      });
    } else if (created.status >= 400) {
      report(`participant ${row.nickname}`, created);
      continue;
    }
    participants.push({ session, nickname: row.nickname, pin: DEMO_PIN, clusterCode, position: index + 1 });
  }
  console.log(
    `· ${participants.length} participants ready (${dump.participants.length} recorded + ${supplemental.participants.length} supplemental; every PIN is ${DEMO_PIN})`,
  );
  return participants;
}

/** The twelve Kallang teams, rostered in sign-up order. Captains create; the rest join. */
async function buildTeams(participants) {
  const teams = [];
  let at = 0;
  for (const plan of TEAM_PLAN) {
    const size = plan.segments.reduce((total, [, count]) => total + count, 0);
    const members = participants.slice(at, at + size);
    at += size;
    const captain = members[0];
    if (!captain) continue;
    const created = await captain.session.call('POST', '/api/teams', { teamName: plan.name });
    let team = created.payload?.team ?? null;
    if (!team) {
      // Re-run: the team exists already; find it so the rooms and draft still see it.
      const listed = await captain.session.call('GET', '/api/teams');
      team = (listed.payload?.items ?? []).find((item) => item.teamName === plan.name) ?? null;
    }
    if (!team) continue;
    for (const member of members.slice(1)) {
      await member.session.call('POST', `/api/teams/${team.id}/join`, {});
    }
    teams.push({ ...team, size: members.length, memberPositions: members.map((member) => member.position - 1) });
  }
  const rostered = teams.reduce((total, team) => total + team.size, 0);
  const complete = teams.filter((team) => team.size >= COMPLETE_TEAM_MIN).length;
  console.log(`· ${teams.length} teams with rosters (${rostered} rostered sign-ups; ${complete} complete at ${COMPLETE_TEAM_MIN}+)`);
  return teams;
}

/**
 * Three rounds of history per station, with the latest round left OPEN so
 * walk-up scans work immediately.
 */
async function runStations(activities, participants) {
  const scanner = new Session('fringe1');
  await scanner.call('POST', '/api/auth/facilitators/signin', { username: 'fringe1', passcode: '1111' });

  // Who got scanned in each round: shifting windows, so most of the crowd has history.
  /*
   * These windows are not arbitrary. Every one of them starts its FIRST round at index 0, so
   * the demo's headline logins (the first names on the roster, the ones a walkthrough signs in
   * as) carry history at four or five different stations rather than one.
   *
   * That is what makes the passport visible: ADR-176 pays the bonus for four DISTINCT
   * stations, so participants 0–13 appear at Netball Shooting Challenge, Hula Hoop Hero,
   * Jump Rope Challenge and Giant Ball Slalom and complete it, while 0–2 also appear at
   * Indoor Bocce Challenge and reach five. Shuffle these and
   * the feature silently stops being demonstrable — the scans still land, but nobody's
   * passport fills and the progress line on the profile never appears.
   */
  const plans = new Map([
    // This station's history is deliberately thin.
    ['Indoor Bocce Challenge', [
      { start: 0, count: 3, age: 150 },
      { start: 30, count: 3, age: 85 },
      { start: 50, count: 3, age: 30 },
    ]],
    ['Netball Shooting Challenge', [
      { start: 0, count: 16, age: 170 },
      { start: 24, count: 16, age: 110 },
      { start: 44, count: 16, age: 45 },
      /*
       * Three solo encore windows: a queue of one, so the regular at position 0 — Wei_Ling,
       * in the persona order the refresh checks — is scanned once more in each of three
       * further rounds. Rounds advance between windows exactly as the facilitator's screen
       * advances them, so she ends with four counted scans here and her passport stacks
       * ADR-261's repeat strikes at one station (three drawn, one folded, ADR-262).
       * Netball Shooting Challenge because its flat completion tier makes an encore a
       * regular coming back rather than a placing being re-taken.
       */
      { start: 0, count: 1, age: 35 },
      { start: 0, count: 1, age: 25 },
      { start: 0, count: 1, age: 15 },
    ]],
    ['Hula Hoop Hero', [
      { start: 0, count: 14, age: 160 },
      { start: 28, count: 14, age: 100 },
      { start: 52, count: 14, age: 35 },
    ]],
    ['Jump Rope Challenge', [
      { start: 0, count: 18, age: 140 },
      { start: 20, count: 18, age: 90 },
      { start: 46, count: 18, age: 40 },
    ]],
    ['Giant Ball Slalom', [
      { start: 0, count: 20, age: 130 },
      { start: 26, count: 20, age: 75 },
      { start: 50, count: 20, age: 25 },
    ]],
  ]);

  for (const activity of activities) {
    const plan = plans.get(activity.activityName) ?? [{ start: 0, count: 10, age: 60 }];
    const tiers = activity.awardTiers ?? [{ label: 'Award' }];
    const isTiered = tiers.length > 1;

    const opened = await scanner.call('POST', `/api/fringe/activities/${activity.id}/rounds`, {});
    let round = opened.payload?.round ?? null;
    let total = 0;
    for (const [roundIndex, window] of plan.entries()) {
      if (!round) break;
      const queue = participants.slice(window.start, window.start + window.count);
      let place = 0;
      for (const participant of queue) {
        const scanned = await scanner.call('POST', '/api/fringe/scans', {
          nickname: participant.nickname,
          roundId: round.id,
          // A placing station awards its podium in order; a flat one pays everyone the same.
          tierLabel: tiers[isTiered ? Math.min(place, tiers.length - 1) : 0]?.label ?? 'Award',
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: minutesAgo(window.age - place),
        });
        if (scanned.status < 400) total += 1;
        place += 1;
      }
      // Advance to the next round except after the last window: that round stays open.
      if (roundIndex < plan.length - 1) {
        const advanced = await scanner.call('POST', `/api/fringe/rounds/${round.id}/advance`, {});
        round = advanced.payload?.round ?? null;
      }
    }
    console.log(
      `· ${activity.activityName}: ${plan.length} rounds, ${total} scans${isTiered ? ' (podiums)' : ''}, latest round open`,
    );
  }
}

/** The social room: beach-day banter from thirty different phones (ADR-046). */
const SOCIAL_CHAT = [
  [0, 'Morning everyone!! Who else took the first train to Kallang in 😤'],
  [7, 'The sand is already HOT and it is not even 10am 🥵'],
  [12, 'Sunscreen table next to the registration tent, bless whoever set that up'],
  [3, 'Kallang Roar assemble at Court 1!!'],
  [19, 'anyone knows where the Hula Hoop Hero station is?'],
  [25, 'past the bocce court, follow the cheering 😂 you cannot miss it'],
  [19, 'found it thanks!! they will not tell us what it is until you are in'],
  [31, 'Indoor Bocce Challenge is no joke, every millimetre counts?!'],
  [16, 'Completing the Indoor Bocce Challenge is THIRTY points?? see you all there'],
  [44, 'Kallang just finished warm up, we are READY 🏐'],
  [8, 'the QR scanning is so fast wah, beep and done'],
  [52, 'My cluster better be top 3 by lunch or I am doing Jump Rope all afternoon'],
  [27, 'Who is the facilitator at Netball Shooting Challenge, they are hyping everyone up 😂😂'],
  [61, 'Just saw the leaderboard flip, BP overtook TM!!'],
  [13, 'refresh the board, it moves by itself lah'],
  [38, 'Kallang Wave vs Stadium Lights was so close omg'],
  [5, 'Captain says drink water. DRINK WATER PEOPLE'],
  [70, 'the photo wall is gold, go vote 📸'],
  [23, 'Lost my team at the beach, found them on the map by the bocce court 😅'],
  [47, 'Line-ups tab says we play NEXT. pray for us'],
  [9, 'Court 2 Kallang side has the better shade, just saying'],
  [33, 'my scan number is easier to remember than my own phone number'],
  [58, 'Jump Rope Challenge round 2 in 10 minutes, bring your whole cluster'],
  [41, 'Someone built a sand Merlion with a MOAT. a MOAT.'],
  [2, 'Match feed says Kallang Roar won again?? carry on 🔥'],
  [66, 'Chat moves so fast today, love it'],
  [29, 'Four stamps and the passport bonus landed, 20 points just appeared 👀'],
  [54, "PS ordered in a bunch of steak and satay for tonight's BBQ!!! \u{1F969}"],
  [45, 'WAIT. BBQ TONIGHT?? suddenly I have energy for three more stations'],
  [54, 'the pits are being set up behind Court 2 already, I can smell the charcoal'],
  [17, "satay AND steak?? PS really said no budget limit today \u{1F62D}\u{1F64F}"],
  [68, 'rolling the giant ball through the slalom at a leisurely pace as we speak. BBQ prep.'],
  [26, "whoever is manning the grill tonight, we salute you in advance \u{1F525}\u{1F356}"],
  [15, 'Anyone wants to trade a Jump Rope slot for the Bocce? asking for my arms'],
  [59, 'strategy: win the final, celebrate at the BBQ, sleep for a week'],
  [72, 'First time at a PSD event, this is so much better than I expected 🙌'],
  [36, 'Our captain scheduled a team chat meeting IN the team chat. respect'],
  [63, 'Passport needs 4 different stations, I have 3. one more. completionist gang'],
  [21, 'The Merlion photo on the wall is winning and it deserves it'],
  [49, 'Up soon alert just buzzed, Ball Tab lit up red, HEART RATE'],
  [11, 'Good luck to everyone in the knockout rounds later!!'],
  [76, 'Weather holding up nicely, someone thank the sky'],
];

async function fillSocialRoom(participants) {
  let sent = 0;
  for (const [index, body] of SOCIAL_CHAT) {
    const sender = participants[index];
    if (!sender) continue;
    const posted = await sender.session.call('POST', '/api/chat/messages', { body });
    if (posted.status < 400) sent += 1;
  }
  console.log(`· ${sent} social chat messages`);
}

/** Every team room gets its own thread — captain logistics plus mid-day morale. */
const TEAM_CHAT_SCRIPTS = [
  ['We are on Court 1 after this match — warm up NOW', 'on the way, grabbing water', 'who has the spare jersey?'],
  ['Good game everyone, shake it off, we take the next one', 'that last point was robbery 😤', 'BBQ after the finals, we eat our feelings either way'],
  ['Scouting report: their tallest player stands left side', 'noted captain 🫡', 'my serve is ON today'],
  ['Meet at the Indoor Bocce Challenge at 2, we need the points', 'bringing the spare balls', 'and the measuring tape'],
  ['Check the Line-ups tab, we are two matches away', 'LED is already red on my phone', 'ok ok warming up'],
  ['Rotation for next match: me, Dee, then subs on 5', 'got it', 'water bottles are behind the net'],
  ['Whoever picked this team name is a genius', 'it was you', 'exactly 😌'],
  ['Final push team — every fringe point counts for the cluster', "Jump Rope Challenge in 15, join! then BBQ \u{1F356}", 'my arms disagree but my stomach says yes'],
];

async function fillTeamRooms(participants, teams) {
  let sent = 0;
  for (const [teamIndex, team] of teams.entries()) {
    const script = TEAM_CHAT_SCRIPTS[teamIndex % TEAM_CHAT_SCRIPTS.length] ?? [];
    for (const [line, body] of script.entries()) {
      // Captain speaks first, then two different members of THIS roster reply —
      // rosters are no longer a uniform six, so the speakers come from the team.
      const positions = team.memberPositions ?? [];
      const speakerAt = line === 0 ? positions[0] : positions[line + 1];
      const speaker = speakerAt === undefined ? undefined : participants[speakerAt];
      if (!speaker) continue;
      const posted = await speaker.session.call('POST', '/api/team-chat/messages', { body });
      if (posted.status < 400) sent += 1;
    }
  }
  console.log(`· ${sent} team chat messages across ${teams.length} rooms`);
}

/** The photo wall: real captioned uploads, likes, and one reported photo for moderation. */
const WALL_PHOTOS = [
  { file: 'social-10-male.png', uploader: 10, caption: 'Round one DONE. Hula Hoop Hero said otherwise 💪' },
  { file: 'social-04-female.png', uploader: 24, caption: 'Indoor Bocce Challenge champion feeling 🎯' },
  { file: 'social-08-female.png', uploader: 41, caption: 'Court 2 crew before the whistle' },
  { file: 'social-03-female.png', uploader: 57, caption: 'Cluster pride on the beach today 🙌' },
  { file: 'merlion.jpg', uploader: 33, caption: 'The real MVP watching over Court 1 🦁' },
];

async function fillPhotoWall(participants) {
  let uploaded = 0;
  const photoIds = [];
  for (const spec of WALL_PHOTOS) {
    const uploader = participants[spec.uploader];
    if (!uploader) continue;
    let bytes;
    try {
      bytes = readFileSync(join(INGEST, spec.file));
    } catch {
      continue; // Image set not present in this checkout — the wall just stays lighter.
    }
    const blob = new Blob([bytes], { type: spec.file.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
    const size = imageSizeOf(bytes);
    const form = new FormData();
    form.set('full', blob, spec.file);
    form.set('thumb', blob, spec.file);
    form.set('raw', blob, spec.file);
    form.set('caption', spec.caption);
    form.set('filename', basename(spec.file));
    form.set('width', String(size.width));
    form.set('height', String(size.height));
    const posted = await uploader.session.upload('/api/gallery/photos', form);
    if (posted.status < 400 && posted.payload?.photo) {
      uploaded += 1;
      photoIds.push(posted.payload.photo.id);
    }
  }

  // Likes: each photo gets its own little crowd, the merlion gets the most (obviously).
  let votes = 0;
  for (const [index, photoId] of photoIds.entries()) {
    const voterCount = index === photoIds.length - 1 ? 12 : 4 + index * 2;
    for (const voter of participants.slice(60, 60 + voterCount)) {
      const voted = await voter.session.call('POST', `/api/gallery/photos/${photoId}/vote`, {});
      if (voted.status < 400) votes += 1;
    }
  }

  // One report, so the superadmin moderation queue is not an empty page.
  let reports = 0;
  if (photoIds[2] && participants[78]) {
    const reported = await participants[78].session.call(
      'POST',
      `/api/gallery/photos/${photoIds[2]}/report`,
      {},
    );
    if (reported.status < 400) reports = 1;
  }
  console.log(`· photo wall: ${uploaded} photos, ${votes} likes, ${reports} report(s)`);
}

async function postAnnouncements(admin) {
  const bodies = [
    'Welcome to PSD Active Day! Scan at any fringe station to earn cluster points 🏖️',
    "PS ordered in a bunch of steak and satay for tonight's BBQ!!! Pits fire up behind Court 2 after the finals.",
    'Group stage closing soon: check the Line-ups tab to see when your team plays.',
  ];
  let posted = 0;
  for (const body of bodies) {
    const created = await admin.call('POST', '/api/admin/announcements', { body });
    if (created.status < 400) posted += 1;
  }
  console.log(`· ${posted} announcements posted`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
