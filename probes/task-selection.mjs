import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TaskClient } from '../config/mods/task-handover/task-client.js';
import { fixture, existingExecution, integratedTransport, diskStorage, SANDBOX_CONTROL } from './sandbox-fixture.mjs';

const draft = { text: 'Continue the exact synthetic conversation.', author: 'synthetic-person', reference: 'synthetic-thread' };
const connect = (storage, transport) => new TaskClient({ machine: '', controlPath: SANDBOX_CONTROL, storage, transport });

async function selectedFixture(t) {
  const boundary = fixture(t);
  const execution = existingExecution(boundary.folder);
  boundary.patch({ terminals: [execution.terminal] });
  const { transport } = integratedTransport(boundary.folder);
  const storage = diskStorage(boundary.folder);
  const client = connect(storage, transport);
  const submitted = await client.submit(draft);
  boundary.control('task-decide', { id: submitted.id, state: 'accepted', reason: 'Own the exact synthetic conversation.' });
  return { ...boundary, ...execution, storage, client, submitted, transport };
}

function noExecution(boundary, id) {
  const snapshot = boundary.control('snapshot');
  assert.equal(snapshot.tasks.find(task => task.id === id).execution, undefined);
  assert.equal(snapshot.workers.length, 0);
  assert.equal(boundary.read().calls.some(call => call.binary === 'hc' && ['run', 'send', 'kill', 'rm'].includes(call.args[0])), false);
}

for (const change of ['session path', 'session header', 'native parent']) {
  test(`public adapter retry lost before adoption commit refuses changed ${change}`, async t => {
    const boundary = await selectedFixture(t);
    const { folder, terminal, sessionFile, storage, submitted, transport, control, patch } = boundary;
    const attempts = [];
    const lost = connect(storage, async (...arguments_) => {
      if (arguments_[1] === 'task-adopt') {
        attempts.push(arguments_[2]);
        throw new Error('Synthetic adoption request lost before backend commit.');
      }
      return transport(...arguments_);
    });
    await assert.rejects(lost.adopt(submitted.id, terminal.address), /lost before backend commit/);
    const original = readFileSync(storage.path, 'utf8');
    const retained = JSON.parse(storage.getItem(lost.key)).adoption;
    assert.equal(typeof retained.selection, 'string');
    assert.deepEqual(retained, { version: 2, id: submitted.id, selection: control('snapshot').tasks[0].selection.identity });
    assert.deepEqual(attempts, [retained]);
    noExecution(boundary, submitted.id);
    const laterFile = change === 'session path' ? join(folder, '.pi/agent/sessions/later.jsonl') : sessionFile;
    if (change !== 'native parent') writeFileSync(laterFile, '{"type":"session","id":"synthetic-conversation-B"}\n');
    patch({ terminals: [{ ...terminal, parent: change === 'native parent' ? 'synthetic-mac/different-parent' : terminal.parent,
      labels: { 'pi.session': laterFile } }] });
    const transcriptBefore = readFileSync(laterFile, 'utf8');
    const originalFileBefore = readFileSync(sessionFile, 'utf8');
    const selectedBefore = control('snapshot').tasks[0].selection;
    const retried = [];
    const resumed = connect(diskStorage(folder), async (...arguments_) => {
      retried.push(arguments_);
      return transport(...arguments_);
    });
    await assert.rejects(resumed.retryAdoption(), /selected execution changed/);
    assert.deepEqual(retried.filter(call => call[1] !== 'snapshot').map(call => [call[1], call[2]]), [['task-adopt', retained]]);
    assert.equal(readFileSync(storage.path, 'utf8'), original);
    assert.deepEqual(control('snapshot').tasks[0].selection, selectedBefore);
    assert.equal(readFileSync(laterFile, 'utf8'), transcriptBefore);
    assert.equal(readFileSync(sessionFile, 'utf8'), originalFileBefore);
    noExecution(boundary, submitted.id);
  });
}

test('lost selection reply is recovered from snapshot and retained on disk before adoption', async t => {
  const boundary = await selectedFixture(t);
  const { folder, storage, submitted, terminal, transport, control } = boundary;
  const calls = [];
  const lost = connect(storage, async (...arguments_) => {
    calls.push(arguments_[1]);
    const reply = await transport(...arguments_);
    if (arguments_[1] === 'task-select') throw new Error('Synthetic selection reply lost after persistence.');
    return reply;
  });
  await assert.rejects(lost.adopt(submitted.id, terminal.address), /selection reply lost/);
  assert.equal(calls.includes('task-adopt'), false);
  const selected = control('snapshot').tasks[0].selection;
  const resumed = connect(diskStorage(folder), async (...arguments_) => {
    if (arguments_[1] === 'task-adopt') {
      const persisted = JSON.parse(storage.getItem(resumed.key)).adoption;
      assert.deepEqual(persisted, { version: 2, id: submitted.id, selection: selected.identity });
    }
    assert.notEqual(arguments_[1], 'task-select');
    return transport(...arguments_);
  });
  assert.equal((await resumed.retryAdoption()).execution.sessionId, 'synthetic-session');
  assert.equal(control('snapshot').workers.length, 1);
});

test('selection storage failure and stale dialog refuse before any adoption request', async t => {
  const boundary = await selectedFixture(t);
  const { storage, submitted, terminal, transport } = boundary;
  const calls = [];
  const failing = { getItem: storage.getItem, setItem: (key, value) => {
    if (JSON.parse(value).adoption) throw new Error('Synthetic selection storage full.');
    storage.setItem(key, value);
  } };
  const client = connect(failing, async (...arguments_) => {
    calls.push(arguments_[1]);
    return transport(...arguments_);
  });
  await assert.rejects(client.adopt(submitted.id, terminal.address), /selection storage full/);
  assert.equal(calls.includes('task-adopt'), false);
  const stale = connect(storage, async (...arguments_) => {
    const reply = await transport(...arguments_);
    if (arguments_[1] === 'snapshot' && reply.tasks.some(task => task.selection)) {
      const retained = JSON.parse(storage.getItem(stale.key));
      storage.setItem(stale.key, JSON.stringify({ ...retained, conflict: 'synthetic-other-dialog' }));
    }
    calls.push(arguments_[1]);
    return reply;
  });
  await assert.rejects(stale.adopt(submitted.id, terminal.address), /Another Herdr dialog/);
  assert.equal(calls.includes('task-adopt'), false);
  noExecution(boundary, submitted.id);
});

test('a stale reconnect refuses adoption before associating its previously retained selection', async t => {
  const boundary = await selectedFixture(t);
  const { storage, submitted, terminal, transport } = boundary;
  const lost = connect(storage, async (...arguments_) => {
    if (arguments_[1] === 'task-adopt') throw new Error('Synthetic adoption request lost before backend commit.');
    return transport(...arguments_);
  });
  await assert.rejects(lost.adopt(submitted.id, terminal.address), /lost before backend commit/);
  const requests = [];
  const resumed = connect(storage, async (...arguments_) => {
    requests.push(arguments_[1]);
    return transport(...arguments_);
  });
  storage.setItem(resumed.key, JSON.stringify({ ...resumed.retained, conflict: 'synthetic-other-dialog' }));
  await assert.rejects(resumed.retryAdoption(), /Another Herdr dialog/);
  assert.deepEqual(requests, ['snapshot']);
  noExecution(boundary, submitted.id);
});

test('a selection request lost before acknowledgment cannot trigger adoption or automatic reselection', async t => {
  const boundary = await selectedFixture(t);
  const { storage, submitted, terminal, transport, control } = boundary;
  const lost = connect(storage, async (...arguments_) => {
    if (arguments_[1] === 'task-select') throw new Error('Synthetic selection request lost before backend commit.');
    return transport(...arguments_);
  });
  await assert.rejects(lost.adopt(submitted.id, terminal.address), /selection request lost/);
  const requests = [];
  const resumed = connect(storage, async (...arguments_) => {
    requests.push(arguments_[1]);
    return transport(...arguments_);
  });
  await assert.rejects(resumed.retryAdoption(), /acknowledged backend selection/);
  assert.deepEqual(requests, ['snapshot']);
  assert.equal(control('snapshot').tasks[0].selection, undefined);
  noExecution(boundary, submitted.id);
});

for (const corruption of ['forged selection', 'cross-task reuse', 'caller metadata', 'old version']) {
  test(`public adapter refuses ${corruption} before an adoption request`, async t => {
    const boundary = await selectedFixture(t);
    const { storage, submitted, terminal, sessionFile, transport, control } = boundary;
    const lost = connect(storage, async (...arguments_) => {
      if (arguments_[1] === 'task-adopt') throw new Error('Synthetic adoption request lost before backend commit.');
      return transport(...arguments_);
    });
    await assert.rejects(lost.adopt(submitted.id, terminal.address), /lost before backend commit/);
    const retained = JSON.parse(storage.getItem(lost.key));
    if (corruption === 'forged selection') retained.adoption.selection = 'forged';
    if (corruption === 'caller metadata') retained.adoption.terminal = terminal.address;
    if (corruption === 'old version') retained.adoption.version = 1;
    if (corruption === 'cross-task reuse') {
      const other = { ...retained.submission, id: 'task-synthetic-other' };
      control('task-submit', other);
      control('task-decide', { id: other.id, state: 'accepted', reason: 'Own another synthetic task.' });
      const selected = control('task-select', { id: other.id, terminal: terminal.address });
      assert.notEqual(selected.selection.identity, retained.adoption.selection);
      retained.selectionRequest.id = other.id;
      retained.adoption.id = other.id;
    }
    storage.setItem(lost.key, JSON.stringify(retained));
    const before = readFileSync(storage.path, 'utf8');
    const transcript = readFileSync(sessionFile, 'utf8');
    const requests = [];
    const resumed = connect(storage, async (...arguments_) => {
      requests.push(arguments_[1]);
      return transport(...arguments_);
    });
    await assert.rejects(resumed.retryAdoption(), /retained adoption differs|unsupported version/);
    assert.deepEqual(requests, ['snapshot']);
    assert.equal(readFileSync(storage.path, 'utf8'), before);
    assert.equal(readFileSync(sessionFile, 'utf8'), transcript);
    noExecution(boundary, submitted.id);
  });
}

test('same-identity transcript append succeeds with the original on-disk selection', async t => {
  const boundary = await selectedFixture(t);
  const { storage, submitted, terminal, sessionFile, transport, control } = boundary;
  const lost = connect(storage, async (...arguments_) => {
    if (arguments_[1] === 'task-adopt') throw new Error('Synthetic adoption request lost before backend commit.');
    return transport(...arguments_);
  });
  await assert.rejects(lost.adopt(submitted.id, terminal.address), /lost before backend commit/);
  const original = JSON.parse(storage.getItem(lost.key)).adoption;
  assert.equal(typeof original.selection, 'string');
  appendFileSync(sessionFile, '{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Continue the same conversation."}]}}\n');
  const content = readFileSync(sessionFile, 'utf8');
  const resumed = connect(storage, transport);
  const adopted = await resumed.retryAdoption();
  assert.equal(adopted.selection.identity, original.selection);
  assert.equal(adopted.execution.sessionId, 'synthetic-session');
  assert.equal(control('snapshot').workers.length, 1);
  assert.equal(readFileSync(sessionFile, 'utf8'), content);
  assert.equal(boundary.read().calls.some(call => call.binary === 'hc' && ['run', 'send', 'kill', 'rm'].includes(call.args[0])), false);
});
