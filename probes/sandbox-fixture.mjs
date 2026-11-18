import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { taskTransport } from '../config/mods/task-handover/control.js';
import { SUPPORTED_TASK_VERSION } from '../config/mods/task-handover/task-client.js';

export const SANDBOX_COMMIT = 'ad1c8f58a630ef44d3a04955e62caf986d2539c6';
const repository = process.env.HERDR_TASK_SANDBOX_SOURCE;
assert.ok(repository, 'Set HERDR_TASK_SANDBOX_SOURCE to the reviewed PR47 source checkout.');
const revision = spawnSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
assert.equal(revision.status, 0, revision.stderr);
assert.equal(revision.stdout.trim(), SANDBOX_COMMIT, 'Review sandbox source changes before updating the pinned fixture.');
export const SANDBOX_CONTROL = join(repository, 'session/control.mjs');
const source = path => pathToFileURL(join(repository, path)).href;
const contract = await import(source('session/task-contract.mjs'));
assert.equal(SUPPORTED_TASK_VERSION, contract.TASK_CONTRACT_VERSION, 'The UI must reject an unsupported protocol.');
export const { fixture, existingExecution, submission } = await import(source('probes/fixtures/task-harness.mjs'));
export const { discordApiFixture } = await import(source('probes/fixtures/task-discord.mjs'));

export function integratedTransport(folder) {
  const appHome = join(folder, 'herdr-profile');
  mkdirSync(appHome);
  const binaries = join(appHome, 'bin');
  mkdirSync(binaries);
  writeFileSync(join(binaries, 'node'), '#!/bin/sh\nexec "$HERDR_FIXTURE_NODE" --disable-warning=ExperimentalWarning --experimental-test-module-mocks --import "$HERDR_FIXTURE_PRELOAD" "$@"\n', { mode: 0o755 });
  const calls = [];
  const controlPath = SANDBOX_CONTROL;
  const host = {
    appHome: () => appHome,
    writeTextFile: async (path, content) => writeFileSync(path, content),
    exec: async (program, args, options) => {
      calls.push({ program, args, options });
      assert.ok(!options?.on, 'This fixture simulates local Herdr transport only.');
      const reply = spawnSync(program, args, { encoding: 'utf8', env: { ...process.env,
        POTS_TASK_FIXTURE: folder, PATH: `${binaries}:${process.env.PATH}`, HERDR_FIXTURE_NODE: process.execPath,
        HERDR_FIXTURE_PRELOAD: join(repository, 'probes/fixtures/task-boundary.mjs') } });
      return { code: reply.status, stdout: reply.stdout ?? '', stderr: reply.stderr ?? String(reply.error ?? '') };
    },
  };
  const transport = taskTransport(host, controlPath);
  return { calls, appHome, transport };
}

export function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
