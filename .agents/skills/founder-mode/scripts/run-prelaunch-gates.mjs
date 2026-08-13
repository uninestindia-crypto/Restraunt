#!/usr/bin/env node
/**
 * run-prelaunch-gates.mjs — the automated portion of steps 3–10.
 *
 * Runs a reviewed list of deterministic R0–R6 commands in file order, stops at the first required
 * failure, and writes a redacted evidence file. It proves nothing about steps 1–2 or 11–15, and it
 * is not authorization: it is a way to make the automated evidence reproducible and hard to fake.
 *
 * Deliberate refusals, in order of how much damage they prevent:
 *   - a dirty product tree, so evidence cannot be attributed to a revision that was never committed
 *   - an environment named like production
 *   - any command matching the destructive-verb list (deploy, migrate, push, rm -rf, drop, …)
 *   - a config whose digest is not recorded alongside the results
 *
 * Usage:
 *   node .agents/skills/founder-mode/scripts/run-prelaunch-gates.mjs \
 *     --root . --config .codex/launch/prelaunch-gates.json
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const SCHEMA_VERSION = 1;

/**
 * Commands that change the world rather than observing it. The runner exists to gather evidence;
 * anything on this list belongs in the runbook, executed by a human who has read step 15.
 */
const DESTRUCTIVE = [
  /\bdeploy\b/i,
  /\bdb\s+push\b/i,
  /\bmigrat(e|ion)\s+(up|down|deploy)\b/i,
  /\bsupabase\s+(db|functions|link|start)\b/i,
  /\bvercel\b/i,
  /\bgit\s+push\b/i,
  /\bnpm\s+publish\b/i,
  /\brm\s+-rf\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\b/i,
  /\bkubectl\b/i,
  /\bterraform\s+apply\b/i,
  /\bcurl\b[^|]*\b-X\s*(POST|PUT|PATCH|DELETE)\b/i
];

const PRODUCTION_ENVIRONMENTS = ['production', 'prod', 'live'];

/** Patterns whose *values* never belong in a stored evidence file. */
const REDACTIONS = [
  [/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, '<redacted:jwt>'],
  [/(sb[a-z]?_[A-Za-z0-9_-]{16,})/g, '<redacted:supabase-key>'],
  [/((?:service_role|anon|api|secret|access|private)[_-]?key["'\s:=]+)([^\s"',]{8,})/gi, '$1<redacted>'],
  [/((?:password|passwd|token|bearer)["'\s:=]+)([^\s"',]{6,})/gi, '$1<redacted>'],
  [/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<redacted:email>']
];

function parseArgs(argv) {
  const args = { root: '.', config: '.codex/launch/prelaunch-gates.json' };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--root' || key === '--config') {
      const value = argv[i + 1];
      if (!value) fail(`${key} needs a value.`);
      args[key.slice(2)] = value;
      i += 1;
    } else if (key === '--help' || key === '-h') {
      process.stdout.write(
        'run-prelaunch-gates.mjs --root <dir> --config <file>\n' +
        'Runs reviewed R0-R6 gates in order and writes redacted evidence.\n'
      );
      process.exit(0);
    } else {
      fail(`Unknown argument: ${key}`);
    }
  }
  return args;
}

function fail(message) {
  process.stderr.write(`BLOCKED — ${message}\n`);
  process.exit(2);
}

function redact(text) {
  return REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** Keep the failure section and the tail; the middle of a passing log is never the evidence. */
function trim(text, limit = 12000) {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.35));
  const tail = text.slice(-Math.floor(limit * 0.65));
  return `${head}\n... <${text.length - limit} characters omitted> ...\n${tail}`;
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout).trim() : '';
}

/**
 * A clean tree is what binds the evidence to a revision (step 2). The release-specific config is
 * allowed to be untracked — it names the frozen revision, so it cannot exist before the freeze —
 * and its digest is recorded instead.
 */
function assertCleanProductTree(root, configRelative) {
  const status = git(root, ['status', '--porcelain']);
  if (!status) return;

  const offending = status
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^\S+\s+/, ''))
    .filter(path => path !== configRelative);

  if (offending.length > 0) {
    fail(
      'the product tree is not clean, so results cannot be attributed to a revision.\n' +
      offending.map(p => `  ${p}`).join('\n')
    );
  }
}

function loadConfig(configPath) {
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    fail(`could not read ${configPath}: ${error.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    fail(`${configPath} is not valid JSON: ${error.message}`);
  }

  if (config.schemaVersion !== SCHEMA_VERSION) {
    fail(`config schemaVersion must be ${SCHEMA_VERSION}, saw ${JSON.stringify(config.schemaVersion)}.`);
  }
  if (!Array.isArray(config.gates) || config.gates.length === 0) {
    fail('config must declare a non-empty "gates" array.');
  }
  if (PRODUCTION_ENVIRONMENTS.includes(String(config.environment || '').toLowerCase())) {
    fail('this runner refuses to run against a production environment. Use the runbook.');
  }

  const digest = createHash('sha256').update(raw).digest('hex');
  return { config, digest };
}

function assertSafe(gate) {
  const command = String(gate.command || '');
  if (!command.trim()) fail(`gate "${gate.id}" has no command.`);
  for (const pattern of DESTRUCTIVE) {
    if (pattern.test(command)) {
      fail(
        `gate "${gate.id}" matches a destructive pattern (${pattern}).\n` +
        '  Deployments, migrations, and production writes belong in the runbook, not here.'
      );
    }
  }
}

function runGate(gate, root) {
  const cwd = gate.cwd ? resolve(root, gate.cwd) : root;
  const started = Date.now();
  const result = spawnSync(gate.command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: Math.max(1, Number(gate.timeoutSeconds) || 900) * 1000,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' }
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';

  return {
    id: gate.id,
    ring: gate.ring || '',
    name: gate.name || gate.id,
    command: gate.command,
    required: gate.required !== false,
    durationMs: Date.now() - started,
    exitCode: result.status,
    verdict: timedOut ? 'BLOCKED' : result.status === 0 ? 'PASS' : 'BLOCKED',
    note: timedOut ? `timed out after ${gate.timeoutSeconds || 900}s` : '',
    output: trim(redact(output))
  };
}

function writeEvidence(root, config, digest, revision, results, overall) {
  const target = resolve(root, config.evidencePath || '.codex/launch/evidence/automated.md');
  mkdirSync(dirname(target), { recursive: true });

  const lines = [
    `# AUTOMATED GATES — ${config.release || 'unnamed release'}`,
    '',
    `Revision: ${revision || '<unknown>'}`,
    `Config digest (sha256): ${digest}`,
    `Environment: ${config.environment || 'local'}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `Overall: ${overall}`,
    '',
    '| Gate | Ring | Verdict | Exit | Duration |',
    '|---|---|---|---:|---:|',
    ...results.map(r =>
      `| ${r.name} | ${r.ring} | ${r.verdict} | ${r.exitCode ?? 'n/a'} | ${(r.durationMs / 1000).toFixed(1)}s |`
    ),
    '',
    '> This runner proves only the automated portion of steps 3-10. Steps 1-2 and 11-15 are not',
    '> cleared by anything below.',
    ''
  ];

  for (const r of results) {
    lines.push(`## ${r.name} — ${r.verdict}`, '', `\`\`\`console`, `$ ${r.command}`, r.output || '<no output>', '```', '');
    if (r.note) lines.push(`Note: ${r.note}`, '');
  }

  writeFileSync(target, lines.join('\n'));
  return target;
}

function main() {
  const args = parseArgs(process.argv);
  const root = resolve(args.root);
  const configPath = isAbsolute(args.config) ? args.config : join(root, args.config);
  const configRelative = relative(root, configPath).split('\\').join('/');

  const { config, digest } = loadConfig(configPath);
  config.gates.forEach(assertSafe);

  if (config.requireCleanTree !== false) assertCleanProductTree(root, configRelative);

  const revision = git(root, ['rev-parse', 'HEAD']);
  if (config.revision && revision && config.revision !== revision) {
    fail(
      `config names revision ${config.revision} but HEAD is ${revision}.\n` +
      '  Evidence from another revision is stale.'
    );
  }

  const results = [];
  let overall = 'READY';

  for (const gate of config.gates) {
    process.stdout.write(`▶ ${gate.ring || '--'} ${gate.name || gate.id}\n`);
    const result = runGate(gate, root);
    results.push(result);
    process.stdout.write(`  ${result.verdict}${result.note ? ` (${result.note})` : ''}\n`);

    if (result.verdict !== 'PASS' && result.required) {
      overall = 'BLOCKED';
      process.stdout.write('  stopping at the first required failure\n');
      break;
    }
  }

  const evidence = writeEvidence(root, config, digest, revision, results, overall);
  process.stdout.write(`\n${overall} — evidence: ${relative(root, evidence)}\n`);
  process.exit(overall === 'READY' ? 0 : 1);
}

main();
