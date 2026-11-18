import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { data, Evaluator, Lexer, Parser } from '@actions/expressions';
import { parse } from 'yaml';

const workflow = new URL('../../.github/workflows/workflow.yaml', import.meta.url);
const steps = parse(readFileSync(workflow, 'utf8')).jobs.build.steps;
const setup = steps.find(step => step.id === 'setup');
const push = steps.find(step => step.id === 'push');
const cache = steps.find(step => step.with && 'cache-to' in step.with);
const sbom = steps.find(step => step.with?.format === 'github');

const expression = /^\s*\$\{\{([\s\S]+?)\}\}\s*$/;

function evaluate(source, context) {
  const tokens = new Lexer(source).lex().tokens;
  const parsed = new Parser(tokens, Object.keys(context), []).parse();
  return new Evaluator(parsed, JSON.parse(JSON.stringify(context), data.reviver)).evaluate();
}

function value(source, context) {
  const match = expression.exec(source);
  return match ? evaluate(match[1], context).coerceString() : source;
}

// Evaluate the condition assuming earlier steps succeeded, as on a clean build.
function wouldRun(step, context) {
  if (step.if === undefined) return true;
  if (typeof step.if === 'boolean') return step.if;
  const condition = expression.exec(step.if)?.[1] ?? step.if;
  return evaluate(`!(${condition})`, context).coerceString() === 'false';
}

function setupOutputs(github) {
  const directory = mkdtempSync(join(tmpdir(), 'publication-guard-'));
  try {
    const output = join(directory, 'output');
    // A nonempty marker exercises the login prerequisite without credentials.
    const setupContext = { github, secrets: { 'registry-username': 'synthetic-user' } };
    const setupEnv = Object.fromEntries(
      Object.entries(setup.env).map(([key, source]) => [key, value(source, setupContext)]),
    );
    execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', setup.run], {
      env: { PATH: process.env.PATH, ...setupEnv, GITHUB_OUTPUT: output },
    });
    return Object.fromEntries(readFileSync(output, 'utf8').trimEnd().split('\n').map(line => line.split('=')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const defaultRef = 'refs/heads/main';
const blocked = { push: false, cache: false, sbom: false };
const allowed = { push: true, cache: true, sbom: true };

for (const [name, event, ref, overrides, expected] of [
  ['PR with publication requested', 'pull_request', 'refs/pull/42/merge', {}, blocked],
  ['PR target with default-branch ref and publication requested', 'pull_request_target', defaultRef, {}, blocked],
  ['default-branch build only', 'push', defaultRef, { push: false, cache: false, 'trivy-sbom-enabled': false }, blocked],
  ['push disabled with cache write and SBOM requested', 'push', defaultRef, { push: false }, { ...allowed, push: false }],
  ['default-branch publication eligible', 'push', defaultRef, {}, allowed],
]) {
  test(name, () => {
    const github = {
      event_name: event,
      ref,
      sha: 'a'.repeat(40),
      event: { repository: { default_branch: 'main' } },
    };
    const inputs = {
      push: true,
      cache: true,
      'cache-tag': 'buildcache',
      'registry-url': 'registry.example.invalid',
      name: 'test',
      'trivy-enabled': true,
      'trivy-sbom-enabled': true,
      ...overrides,
    };
    const context = { github, inputs, steps: { setup: { outputs: setupOutputs(github) } } };

    // Only the setup script ran. Never invoke login, Docker, or SBOM submission,
    // even if an assertion finds that the workflow would allow an operation.
    assert.deepEqual({
      push: wouldRun(push, context),
      cache: Boolean(value(cache.with['cache-to'], context)),
      sbom: wouldRun(sbom, context),
    }, expected);
  });
}
