/*
 * shiphats-activate.mjs — fill in and rename the inert SHIP-HATS pipeline files.
 *
 * What the four files are for is in docs/design/ship-hats-pipeline.md. This script does one
 * job and does it without dependencies: ask for the values only a human knows, substitute
 * them into the `@@NAME@@` slots, and rename `X.shiphats` to `X`. Nothing is downloaded and
 * nothing is installed — a clone plus a node binary is enough, which is what makes it
 * usable on a remote host with no network and no toolchain.
 *
 * It will not write a secret into a file. Every credential the pipeline needs is referenced
 * by NAME, and the values belong in GitLab's masked and protected CI/CD variables; the list
 * to create there is printed at the end, so the handover is one screen instead of a
 * scavenger hunt through the tutorial.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** inert name -> live name. The live names are fixed by the template, not by taste. */
const FILES = [
  { inert: '.gitlab-ci.yml.shiphats', live: '.gitlab-ci.yml' },
  { inert: 'BUILD.gitlab-ci.yml.shiphats', live: 'BUILD.gitlab-ci.yml' },
  { inert: 'TEST.gitlab-ci.yml.shiphats', live: 'TEST.gitlab-ci.yml' },
  { inert: 'DEPLOY.gitlab-ci.yml.shiphats', live: 'DEPLOY.gitlab-ci.yml' },
];

const BOOLS = new Set(['true', 'false']);
const TAG_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * The questions, in the order they are asked: the template to include, then the build, then
 * the runtime the readiness job probes, then the repositories, then the two environments,
 * then the security tools. `note` prints above the answer's effect, `warn` prints after it
 * is accepted — a value that must be re-checked later says so where it was chosen.
 */
const SCHEMA = [
  {
    key: 'SHIPHATS_TEMPLATE_PROJECT',
    question: 'SGTS GitLab project holding the webapp E2E template',
    value: 'innersource/sgts/ship-hats/e2e-templates/ship-hats-webapp-e2e-templates',
    warn: 'Confirm against the onboarding e-mail. A wrong path is "include file not found", '
      + 'not a warning — and the group moved from WOG/GVT/ship to innersource/sgts/ship-hats.',
  },
  {
    key: 'SHIPHATS_TEMPLATE_REF',
    question: 'Template ref — a tag, never a branch',
    value: 'v1.1.0',
    note: 'Templates are version-tagged from v1.1.0 onwards, and the E2E set is no longer '
      + 'actively maintained; pinning is what keeps an unmaintained template from moving.',
  },
  { key: 'SHIPHATS_TEMPLATE_FILE', question: 'File inside that template to include', value: '.gitlab-ci.yml' },
  {
    key: 'WORKING_DIR',
    question: 'Directory the artefact is built in',
    value: '.',
    type: 'path',
    note: 'BUILD.gitlab-ci.yml writes its artifacts paths literally, relative to the repo root, '
      + 'because GitLab does not expand variables in artifacts:paths. "." is that assumption.',
    check: (v) => (v === '.'
      ? null
      : 'this template expects WORKING_DIR to be "." — if you change it, edit the two '
        + 'artifacts paths in BUILD.gitlab-ci.yml to match'),
  },
  {
    key: 'OUTPUT_ARTEFACT',
    question: 'File the compliance jobs sign, scan and publish',
    value: 'psd-active-day-image.tar',
    note: 'For a container app the artefact is the image tarball Kaniko writes: one file serves '
      + 'the Nexus upload and `docker load` on the host.',
    check: (v) => (/^[A-Za-z0-9._-]+$/.test(v)
      ? null
      : 'one filename: no whitespace, no "/", no quotes'),
  },
  {
    key: 'VERSION',
    question: 'Version label on the image and the artefact',
    value: () => readPackageVersion(),
    note: 'From package.json. The pipeline suffixes it with the short SHA, so two builds of the '
      + 'same version stay distinguishable in the registry.',
  },
  {
    key: 'DOCKERFILE',
    question: 'Dockerfile to build',
    value: 'Dockerfile-prd',
    note: 'Dockerfile-prd is the same image with PSD_SEED=default; Dockerfile ships the demo '
      + 'seed. The two may differ by that one line and no other (scripts/check-standards.mjs).',
    check: (v) => (existsSync(join(ROOT, v)) ? null : `no such file in the repo root: ${v}`),
    warn: 'A production pipeline pointed at the demo-seeded Dockerfile ships demo participants.',
  },
  {
    key: 'IMAGE_REGISTRY',
    question: 'Registry host to tag the image for',
    value: 'registry.sgts.gitlab-dedicated.com/$CI_PROJECT_NAMESPACE',
    note: '$CI_PROJECT_NAMESPACE is expanded by GitLab at pipeline time, which keeps the tag '
      + 'inside the project’s own registry namespace without hard-coding it.',
  },
  { key: 'IMAGE_REPOSITORY', question: 'Repository under that host', value: 'psd-active-day' },
  { key: 'IMAGE_NAME', question: 'Image name', value: 'app' },
  {
    key: 'PUSH_IMAGE',
    question: 'Push the image to that registry (true) or keep the tarball only (false)',
    value: 'false',
    type: 'bool',
  },
  {
    key: 'PORT',
    question: 'Port the container listens on',
    value: '3000',
    type: 'port',
    note: 'Dockerfile-prd sets PORT=3000 and EXPOSEs it (ADR-323); RUN_OPTS below publishes the same number.',
  },
  {
    key: 'READINESS_PATH',
    question: 'Path the readiness check requests',
    value: '/api/health/ready',
    type: 'path',
    note: 'Registered at apps/api/src/app.ts:189. It answers before any data exists, which is '
      + 'what a readiness probe wants — it says "the process serves", not "the demo is seeded".',
  },
  {
    key: 'WEBAPP_NAME',
    question: 'Text the readiness job looks for in that response',
    value: 'ok',
    note: 'The endpoint returns {"ok":true}, and the template greps for this text rather than '
      + 'parsing JSON.',
    warn: 'If /api/health stops returning "ok", every deploy fails on readiness and the cause '
      + 'looks like the deploy. Change the two together.',
  },
  {
    key: 'NEXUSREPO_REPO_ID',
    question: 'Nexus hosted repository id for the artefact',
    value: 'ship-raw-test',
    warn: 'Use the repository your onboarding created for this project. Uploading into a shared '
      + 'repo is how artefacts get mixed between agencies.',
  },
  {
    key: 'NEXUSREPO_REPO_GROUP_ID',
    question: 'Group id for the uploaded artefact',
    value: 'sg/psd/active-day',
  },
  {
    key: 'ARTEFACT_ID',
    question: 'Artefact id for the uploaded artefact',
    value: 'psd-active-day',
    check: (v) => (/\s/.test(v) ? 'the docs are explicit: ARTEFACT_ID may not contain whitespace' : null),
  },
  {
    key: 'ARTEFACT_PACKAGE',
    question: 'Packaging Nexus records for the artefact',
    value: 'tar',
    note: 'The extension the uploaded file is given. The docs’ examples use "zip"; this app '
      + 'produces a tar, and the checksum file is "<artefact>.sha512" either way.',
  },
  { key: 'NEXUS_REPO_URL', question: 'Nexus repository URL the upload posts to', value: '', type: 'url', blankOk: true },
  {
    key: 'NEXUS_NPM_GROUP_REPO',
    question: 'npm registry URL to install through (Nexus group repo)',
    value: '',
    type: 'url',
    blankOk: true,
    note: 'Shared runners have no general egress, so `npm ci` normally has to resolve through '
      + 'Nexus. Leave blank only if this project’s runners can reach the public registry.',
    warn: 'Blank means every Node job installs from the default registry, which on a SHIP-HATS '
      + 'shared runner fails as a network error inside npm ci.',
  },
  {
    key: 'MVN_SETTINGS_FILE',
    question: 'Path the job writes its Maven settings.xml to',
    value: '/tmp/mvn-settings.xml',
    type: 'path',
  },
  {
    key: 'MAVEN_SETTINGS_SERVER_ID',
    question: 'settings.xml server id (the credential pair Nexus looks up)',
    value: 'ship-nexus',
  },
  { key: 'NODE_IMAGE', question: 'Image the Node jobs run in', value: 'node:22-alpine' },
  {
    key: 'KANIKO_IMAGE',
    question: 'Kaniko image (the debug variant, since the job needs a shell)',
    value: 'gcr.io/kaniko-project/executor:v1.23.2-debug',
    warn: 'Point this at your Nexus docker proxy copy — gcr.io is not reachable from the '
      + 'shared runners. Pin the tag; Kaniko’s default tag is not reproducible.',
  },
  { key: 'CRANE_IMAGE', question: 'Crane image used to push the tarball', value: 'gcr.io/go-containerregistry/crane:debug' },
  {
    key: 'RUNNER_TAG_BUILD',
    question: 'Runner tags for the image build, comma separated',
    value: 'ship_docker,non_privileged',
    type: 'tags',
    note: 'Kaniko needs a non-privileged runner that allows root; the docs name ship_docker for '
      + 'that combination (DinD and privileged runners are not offered).',
  },
  {
    key: 'RUNNER_TAG_PUSH',
    question: 'Runner tags for the registry push',
    value: 'cstack,non_privileged',
    type: 'tags',
    note: 'Skopeo and Crane are documented to run on cstack runners with no root.',
  },
  { key: 'RUNNER_TAG_TOOLING', question: 'Runner tags for the lint and test jobs', value: 'ship_docker', type: 'tags' },
  { key: 'RUNNER_TAG_DEPLOY', question: 'Runner tags for the deploy jobs', value: 'cstack,non_privileged', type: 'tags' },
  {
    key: 'DEPLOY_STRATEGY',
    question: 'Deploy strategy',
    value: 'docker-ssh',
    check: (v) => (v === 'docker-ssh'
      ? null
      : 'only "docker-ssh" is implemented: this repo ships one image and one container, and '
        + 'there is no manifest in the repo to apply. Write the k8s variant in '
        + 'DEPLOY.gitlab-ci.yml (templates/gitlab-ci-k8.yml + kubectl-aws) if the environment needs it.'),
  },
  {
    key: 'DEPLOY_IMAGE',
    question: 'Image the deploy jobs run in',
    value: 'alpine:3.20',
    note: 'It must already carry ssh, scp, curl and (if the AWS secret path is used) the AWS CLI. '
      + 'A job cannot apk-add its way out of this on a shared runner: the package index is not '
      + 'reachable either, so bake the image or take the platform’s.',
    warn: 'The deploy jobs check for ssh at run time and fail with that message rather than a '
      + 'cryptic exec error.',
  },
  {
    key: 'E2E_IMAGE',
    question: 'Image the Playwright job runs in (browsers already installed)',
    value: 'mcr.microsoft.com/playwright:v1.55.1-noble',
    note: 'Version-matched to @playwright/test ^1.55.1 in package.json: the image and the '
      + 'library disagree by a patch level and Playwright then refuses the browsers it was '
      + 'given. Mirror it in Nexus for the same reason as the other images.',
  },
  { key: 'DEPLOY_USER', question: 'SSH user on the deploy hosts', value: 'deploy' },
  { key: 'TESTING_HOST', question: 'Testing host (hostname or IP a runner can reach)', value: '', blankOk: true },
  { key: 'PRODUCTION_HOST', question: 'Production host', value: '', blankOk: true },
  {
    key: 'TESTING_URL',
    question: 'Testing environment URL (the e2e target and the GitLab environment link)',
    value: (v) => (v.TESTING_HOST === '' ? '' : `http://${v.TESTING_HOST}:3000`),
    type: 'url',
    blankOk: true,
  },
  {
    key: 'PRODUCTION_URL',
    question: 'Production environment URL',
    value: (v) => (v.PRODUCTION_HOST === '' ? '' : `http://${v.PRODUCTION_HOST}:3000`),
    type: 'url',
    blankOk: true,
  },
  {
    key: 'WEBAPP_URL',
    question: 'URL the readiness job can reach from a runner',
    value: (v) => (v.TESTING_URL !== '' ? v.TESTING_URL : 'http://127.0.0.1:3000'),
    type: 'url',
    note: '127.0.0.1 only works for a check that runs ON the host — which is what the deploy job '
      + 'below does. The template’s own wait-for-web-app-ready-job needs a reachable URL.',
  },
  {
    key: 'REMOTE_IMAGE_DIR',
    question: 'Directory on the host the tarball is copied to',
    value: '/var/lib/psd-active-day/images',
    type: 'path',
  },
  {
    key: 'REMOTE_ENV_FILE',
    question: 'Env file on the host the container reads at start',
    value: '/etc/psd-active-day.env',
    type: 'path',
    note: 'Runtime configuration is env vars (SUPERADMIN_INITIAL_PASSCODE, TUNNEL_TOKEN, '
      + 'DATABASE_* …). It lives on the host, not in the image and not in GitLab.',
  },
  { key: 'CONTAINER_NAME', question: 'Container name on the host', value: 'psd-active-day' },
  {
    key: 'RUN_OPTS',
    question: 'Extra docker run options',
    value: '-p 3000:3000 -v psd-active-day-data:/data',
    note: 'The /data volume is PGLITE_DATA_DIR — the app’s database only survives a redeploy if '
      + 'it is a volume. On an external Postgres, put DATABASE_* in the env file instead.',
  },
  { key: 'AWS_REGION', question: 'AWS region holding the SSH key secret', value: 'ap-southeast-1' },
  {
    key: 'AWS_SECRET_ID_TESTING',
    question: 'AWS Secrets Manager id holding the testing SSH key',
    value: '',
    blankOk: true,
    note: 'The documented alternative to storing a key in GitLab: the job assumes a role through '
      + 'its OIDC token and reads the secret (templates/gitlab-ci-aws.yml).',
  },
  { key: 'AWS_SECRET_ID_PRODUCTION', question: '… and the production one', value: '', blankOk: true },
  {
    key: 'SSH_KEY_NAME',
    question: 'Field to read from that secret, or "raw" if the secret is the key itself',
    value: 'raw',
    note: 'The deploy job cuts a JSON field out with sed, because an arbitrary deploy image '
      + 'promises neither jq nor node. A secret that is the private key verbatim needs no parsing.',
  },
  {
    key: 'OIDC_AUDIENCE',
    question: 'Audience the job requests in its OIDC id token',
    value: 'sts.amazonaws.com',
    note: 'Must match the audience your IAM OIDC identity provider was configured with, or the '
      + 'assume-role call rejects the token.',
  },
  {
    key: 'USE_SONAR',
    question: 'SonarQube is in place (the framework then runs ship-sonarqube-scan)',
    value: 'false',
    type: 'bool',
  },
  {
    key: 'SONAR_PROJECTKEY',
    question: 'Sonar project key',
    value: 'psd-active-day',
    skipIf: (v) => v.USE_SONAR !== 'true',
  },
  {
    key: 'USE_NEXUS_IQ',
    question: 'Nexus IQ is in place (otherwise the depcheck job’s npm audit is the gate)',
    value: 'false',
    type: 'bool',
  },
  {
    key: 'USE_FOD',
    question: 'Fortify on Demand is in place (otherwise GitLab’s native SAST/DAST run)',
    value: 'false',
    type: 'bool',
  },
  {
    key: 'FOD_RELEASE',
    question: 'Fortify release name',
    value: '',
    blankOk: true,
    skipIf: (v) => v.USE_FOD !== 'true',
  },
  {
    key: 'RF_TESTSCRIPT_FOLDER',
    question: 'Robot Framework test folder, if the template’s e2e-test-job is ever adopted',
    value: 'e2e/robot',
    note: 'This repo’s end-to-end suite is Playwright, so webapp-e2e-job runs that instead. The '
      + 'variable is only read by the template’s Robot job.',
  },
];

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' && pkg.version !== '' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseArgs(argv) {
  const opts = { mode: 'ask', answersFile: '', dryRun: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.mode = 'help';
    } else if (arg === '--defaults') {
      opts.mode = 'defaults';
    } else if (arg === '--list') {
      opts.mode = 'list';
    } else if (arg === '--revert') {
      opts.mode = 'revert';
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--answers') {
      opts.mode = 'answers';
      i += 1;
      opts.answersFile = argv[i] ?? '';
      if (opts.answersFile === '') {
        throw new Error('--answers needs a file path');
      }
    } else {
      throw new Error(`unknown argument: ${arg} (try --help)`);
    }
  }
  return opts;
}

const HELP = `Usage: ./shiphats-activate.sh [option]

  (no option)       answer each question; Enter takes the shown default
  --defaults        accept every default, no questions
  --answers FILE    take values from a JSON object of {"KEY": "value"} pairs
  --list            print every value this script can set, with its default
  --dry-run         compute everything, write nothing
  --force           overwrite an existing live file (also used with --revert)

Turns .gitlab-ci.yml.shiphats and BUILD/TEST/DEPLOY.gitlab-ci.yml.shiphats into the four
files GitLab reads. No secret is ever written into a file: the pipeline references them by
name and their values go into GitLab's Settings → CI/CD → Variables, which the script prints
as a checklist when it finishes.

Answers that are still unknown can be left blank where the pipeline can survive it, and the
summary lists what is left to fill. Reversible with --revert.
`;

/**
 * `rl.question` on its own leaves the promise pending forever when stdin closes — node then
 * prints "unsettled top-level await" and exits 0 with nothing written, which is the worst
 * way for a script like this to end. The close listener turns it into an error instead.
 */
const STDIN_CLOSED = 'stdin closed before this question was answered. For a piped or remote '
  + 'session, run with --defaults or --answers FILE instead.';

function ask(rl, text) {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error(STDIN_CLOSED));
    rl.once('close', onClose);
    rl.question(text, (answer) => {
      rl.off('close', onClose);
      resolve(answer);
    });
  });
}

/**
 * Values are pasted into a double-quoted YAML scalar, so the guard is on the characters that
 * could end that scalar early. A value with a quote in it is refused here rather than
 * producing a file that fails GitLab's parser with a line number nobody is looking at.
 */
function problemWith(spec, raw) {
  if (/["')\n]/.test(raw)) {
    return 'must not contain a double quote, a closing bracket or a newline';
  }
  if (raw === '' && !spec.blankOk) {
    return 'needs a value — the pipeline would fail later with a worse message';
  }
  if (spec.type === 'bool' && !BOOLS.has(raw)) {
    return 'answer true or false';
  }
  if (spec.type === 'port' && !/^\d{1,5}$/.test(raw)) {
    return 'answer a port number';
  }
  if (spec.type === 'tags') {
    const bad = raw.split(',').filter((t) => t.trim() !== '' && !TAG_KEY.test(t.trim()));
    if (bad.length > 0) {
      return `a runner tag may only use letters, digits, dot, dash and underscore — got ${bad.join(', ')}`;
    }
  }
  if (spec.type === 'url' && raw !== '' && !/^https?:\/\/\S+$/.test(raw)) {
    return 'answer an http(s) URL, or blank';
  }
  if (spec.type === 'path' && raw !== '' && !/^[/.][^\s"]*$/.test(raw)) {
    return 'answer a path starting with / or .';
  }
  return spec.check ? spec.check(raw) : null;
}

async function promptFor(rl, spec, fallback) {
  const hint = fallback === '' ? '(blank to leave unset)' : `(default: ${fallback})`;
  for (;;) {
    const answer = await ask(rl, `${spec.question} ${hint}\n> `);
    const raw0 = String(answer).trim();
    const raw = raw0 === '' ? fallback : raw0;
    const problem = problemWith(spec, raw);
    if (problem) {
      console.log(`  ${problem}`);
      continue;
    }
    if (spec.note) {
      console.log(`  note: ${spec.note}`);
    }
    return raw;
  }
}

/**
 * Walks the schema once, in order, because later defaults read earlier answers (the testing
 * URL becomes the readiness URL, a host that stayed blank keeps its URL blank). A key whose
 * `skipIf` is true is filled with its default silently: the file still contains the variable,
 * so leaving it unsubstituted would fail the pipeline for the sake of one unused key.
 */
async function gather(opts) {
  const values = {};
  const notAsked = [];
  const interactive = opts.mode === 'ask';
  const rl = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  let given = null;
  if (opts.mode === 'answers') {
    given = JSON.parse(readFileSync(opts.answersFile, 'utf8'));
    if (given.values && typeof given.values === 'object') {
      given = given.values;
    }
  }
  try {
    for (const spec of SCHEMA) {
      const fallback = typeof spec.value === 'function' ? String(spec.value(values)) : String(spec.value ?? '');
      if (spec.skipIf && spec.skipIf(values)) {
        values[spec.key] = fallback;
        notAsked.push(spec.key);
        continue;
      }
      let raw = fallback;
      if (given) {
        if (given[spec.key] !== undefined && given[spec.key] !== null) {
          raw = String(given[spec.key]);
        }
      } else if (rl) {
        raw = await promptFor(rl, spec, fallback);
      }
      const problem = problemWith(spec, raw);
      if (problem) {
        throw new Error(`${spec.key}: ${problem}`);
      }
      values[spec.key] = raw;
      if (spec.warn) {
        console.log(`  ! ${spec.key}: ${spec.warn}`);
      }
    }
  } finally {
    rl?.close();
  }
  return { values, notAsked };
}

/** The only structural edit this script makes: a comma list becomes one YAML list item each. */
function substitute(text, values) {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    const listLine = new RegExp(`^([ \\t]*)- "@@${key}@@"$`, 'gm');
    out = out.replace(listLine, (match, indent) => value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '')
      .map((t) => `${indent}- "${t}"`)
      .join('\n'));
    out = out.split(`@@${key}@@`).join(value);
  }
  return out;
}

function renderAll(values) {
  return FILES.map((file) => {
    const path = join(ROOT, file.inert);
    if (!existsSync(path)) {
      throw new Error(`missing ${file.inert} — the inert set must be complete before activation`);
    }
    const read = readFileSync(path, 'utf8');
    const text = substitute(read, values);
    const leftover = [...new Set(text.match(/@@[A-Z0-9_]+@@/g) ?? [])];
    if (leftover.length > 0) {
      throw new Error(`${file.inert}: no answer for ${leftover.join(', ')} — the schema and the `
        + 'file disagree, and this script will not guess a value for you');
    }
    return { ...file, text, source: read };
  });
}

/**
 * Keys the schema does not write into any file. `NEXUS_IQ_USERNAME` and friends are
 * deliberately in that set: they exist so the checklist is complete, not so they can be
 * substituted.
 */
function unusedKeys(values, rendered) {
  const written = rendered.map((f) => f.text).join('');
  const inert = rendered.map((f) => f.source).join('');
  return Object.keys(values)
    .filter((key) => !written.includes(`$${key}`) && !inert.includes(`@@${key}@@`));
}

function printBlanks(values, notAsked) {
  const blank = SCHEMA.filter((s) => values[s.key] === '' && !notAsked.includes(s.key));
  if (blank.length > 0) {
    console.log('\nleft blank — fill these in .gitlab-ci.yml when the answer exists:');
    for (const spec of blank) {
      console.log(`  $${spec.key}  — ${spec.question}`);
    }
  }
  if (notAsked.length > 0) {
    console.log(`\nnot asked, because the switch that reads them is off: ${notAsked.join(', ')}`);
  }
}

function secretChecklist(values) {
  const rows = [[
    'COSIGN_PASSWORD',
    'sign-artefact-job needs it; the signing key itself stays in the cosign KMS',
  ]];
  if (values.USE_SONAR === 'true') {
    rows.push(['SONAR_TOKEN', 'a SonarQube user token, minted in Sonar for this project']);
  }
  if (values.USE_NEXUS_IQ === 'true') {
    rows.push(['NEXUS_IQ_USERNAME', 'Nexus IQ credential']);
    rows.push(['NEXUS_IQ_PASSWORD', 'Nexus IQ credential']);
    rows.push(['NEXUS_IQ_APP_ID', 'the public id Nexus IQ gave this application']);
    rows.push(['NEXUS_IQ_SCAN_OPTIONS', 'flags for the CLI, e.g. -s /tmp/pom.xml']);
  }
  if (values.USE_FOD === 'true') {
    rows.push(['FOD_USERNAME', 'Fortify on Demand username']);
    rows.push(['FOD_PAT', 'Fortify on Demand personal access token']);
    rows.push(['FOD_RELEASE', `must match the release in ${values.FOD_RELEASE || 'Fortify'} `
      + '(the name itself is a variable in the file, not a secret)']);
  }
  rows.push(['NEXUS_REPO_USERNAME', 'only if artefacts are published to Nexus']);
  rows.push(['NEXUS_REPO_PASSWORD', 'only if artefacts are published to Nexus']);
  if (values.AWS_SECRET_ID_TESTING === '' && values.AWS_SECRET_ID_PRODUCTION === '') {
    rows.push(['DEPLOY_SSH_KEY', 'the fallback the deploy job uses when no AWS secret id is '
      + 'configured — a private key: masked AND protected']);
  }
  return rows;
}

function printNextSteps(values) {
  console.log('\nnext steps, in order:\n');
  console.log('  1. GitLab → Settings → CI/CD → Variables → Add each of these. Masked, and');
  console.log('     protected for anything that can reach production. None of them belongs in');
  console.log('     a file, including this repo:\n');
  for (const [name, why] of secretChecklist(values)) {
    console.log(`       ${name.padEnd(22)} ${why}`);
  }
  console.log('\n  2. GitLab → Settings → General → Compliance framework →');
  console.log('     ship-hats-webapp-compliance. Without it these four files are a pipeline');
  console.log('     with no gates. With it the framework adds secret detection, SCA, SAST and');
  console.log('     DAST, the Nexus IQ and Sonar scans, the signing job, and the verification');
  console.log('     jobs that hang around deploy-final-job. A failing compliance job does not');
  console.log('     fail this pipeline — it produces the report a reviewer reads.');
  console.log('\n  3. Check the runner tags exist for this project (Settings → CI/CD → Runners):');
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('RUNNER_TAG_')) {
      console.log(`       ${key}=${value.replace(/,/g, ', ')}`);
    }
  }
  console.log('\n  4. Lint the result before pushing it: paste .gitlab-ci.yml into the CI Lint');
  console.log('     page. The likeliest error is a stage name the included template does not');
  console.log('     declare — the stage list comes from the template, and these files only');
  console.log('     write jobs into it.');
  console.log('\n  5. To back out, run ./shiphats-activate.sh --revert. Nothing else in the');
  console.log('     repo was touched: the pipeline jobs never ran here, and no app file was');
  console.log('     edited.\n');
}

function printList() {
  console.log('values shiphats-activate.sh sets, in the order it asks for them:\n');
  for (const spec of SCHEMA) {
    const def = typeof spec.value === 'function' ? '(derived from the repo)' : spec.value;
    console.log(`  ${spec.key.padEnd(28)} ${def === '' ? '(blank)' : def}`);
    console.log(`  ${''.padEnd(28)} ${spec.question}`);
  }
}

function revert(force) {
  let moved = 0;
  for (const file of FILES) {
    const live = join(ROOT, file.live);
    if (!existsSync(live)) {
      continue;
    }
    const inert = join(ROOT, file.inert);
    if (existsSync(inert)) {
      // The template survived activation, so going back is a delete, not a move — the inert
      // copy is the one to keep, and it is the one that carries the placeholders.
      rmSync(live, { force: true });
      moved += 1;
      console.log(`  removed ${file.live} (inert copy kept at ${file.inert})`);
      continue;
    }
    if (!force) {
      console.log(`  ${file.live} has no inert counterpart to go back to — leaving it alone.`);
      continue;
    }
    rmSync(live, { force: true });
    moved += 1;
    console.log(`  removed ${file.live}`);
  }
  if (moved === 0) {
    console.log('nothing to revert: no live pipeline files found.');
    return;
  }
  console.log(`\nreverted ${moved} file${moved === 1 ? '' : 's'}: the pipeline is inert again.`);
  console.log('Nothing else was touched. The answers only ever existed in the files that were');
  console.log('just deleted — so if you had committed them, `git status` shows the deletion, and');
  console.log('if you had not, the values are gone and you will be asked again.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'help') {
    console.log(HELP);
    return;
  }
  if (opts.mode === 'list') {
    printList();
    return;
  }
  if (opts.mode === 'revert') {
    revert(opts.force);
    return;
  }

  if (opts.mode === 'ask') {
    console.log('SHIP-HATS pipeline — activation');
    console.log('');
    console.log('Every answer is written into the pipeline files as a CI variable, so it');
    console.log('becomes part of the repo and reviewable. The defaults are this repo’s own');
    console.log('facts (port 3000, /api/health, the Dockerfile pair); the rest are decisions or');
    console.log('things only the onboarding e-mail knows. Nothing is written until the last');
    console.log('question is answered — Ctrl-C is safe.\n');
  }

  const { values, notAsked } = await gather(opts);
  const rendered = renderAll(values);
  const taken = rendered.filter((f) => existsSync(join(ROOT, f.live)));
  if (taken.length > 0 && !opts.force) {
    throw new Error(`refusing to overwrite ${taken.map((f) => f.live).join(', ')}. A project that `
      + 'already has a .gitlab-ci.yml cannot take the template include — move it aside, or '
      + 'answer the same values into it by hand, or use --force if you mean to replace it.');
  }

  console.log('\nvalues written into the variables block (these are settings, not secrets):\n');
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${key.padEnd(28)} ${value === '' ? '(blank)' : value}`);
  }
  console.log(`\n${opts.dryRun ? 'dry run — would write' : 'writing'}:\n`);
  for (const file of rendered) {
    const lines = file.text.split('\n').length;
    console.log(`  ${file.inert} → ${file.live}  (${lines} lines)`);
    if (!opts.dryRun) {
      writeFileSync(join(ROOT, file.live), file.text);
    }
  }
  const unused = unusedKeys(values, rendered);
  if (unused.length > 0) {
    console.log(`\nset but not referenced by name in these files (the template reads them): ${unused.join(', ')}`);
  }
  printBlanks(values, notAsked);
  if (opts.dryRun) {
    console.log('\nnothing was renamed. Drop --dry-run to write the files.');
    return;
  }
  printNextSteps(values);
}

try {
  await main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
