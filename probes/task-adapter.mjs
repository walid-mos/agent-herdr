import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskClient } from '../config/mods/task-handover/task-client.js';

const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
};
const supported = (target = 'synthetic') => ({ version: 2, target, operations: ['task-submit', 'task-select', 'task-adopt'] });
const draft = { text: 'Produce the synthetic report.', author: 'synthetic-person', reference: 'synthetic-thread' };

test('missing or incompatible capability refuses before intake', async () => {
  for (const taskContract of [undefined, { ...supported(), version: 1 }, { ...supported(), version: 3 },
    { ...supported(), operations: ['task-submit', 'task-adopt'] }]) {
    const calls = [];
    const client = new TaskClient({ machine: '', storage: storage(), transport: async (_machine, operation) => {
      calls.push(operation);
      return { taskContract, tasks: [] };
    } });
    await assert.rejects(client.submit(draft), /rollout/);
    assert.deepEqual(calls, ['snapshot']);
  }
});

test('lost reply retains the complete original request through reconnect and target mismatch', async () => {
  const retained = storage();
  const requests = [];
  let target = 'synthetic';
  const transport = async (_machine, operation, request) => {
    if (operation === 'snapshot') return { taskContract: supported(target), tasks: [] };
    requests.push(request);
    throw new Error('Synthetic reply lost.');
  };
  const first = new TaskClient({ machine: '', storage: retained, transport });
  await assert.rejects(first.submit(draft), /reply lost/);
  const second = new TaskClient({ machine: '', storage: retained, transport });
  await assert.rejects(second.retry(), /reply lost/);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[0].provenance.author, 'synthetic-person');
  target = 'another-pot';
  await assert.rejects(second.retry(), /target/);
  assert.equal(requests.length, 2);
});

test('storage failure prevents intake instead of losing the retry identity', async () => {
  const calls = [];
  const client = new TaskClient({ machine: '', storage: { getItem: () => null, setItem: () => { throw new Error('Synthetic storage full.'); } },
    transport: async (_machine, operation) => {
      calls.push(operation);
      return { taskContract: supported(), tasks: [] };
    } });
  await assert.rejects(client.submit(draft), /storage full/);
  assert.deepEqual(calls, ['snapshot']);
});

test('a stale dialog cannot erase another retained request', async () => {
  const retained = storage();
  const transport = async (_machine, operation, request) => {
    if (operation === 'snapshot') return { taskContract: supported(), tasks: [] };
    return { ...request, owner: 'synthetic', delivery: { state: 'delivered' }, acceptance: { state: 'pending' } };
  };
  const first = new TaskClient({ machine: '', storage: retained, transport });
  const second = new TaskClient({ machine: '', storage: retained, transport });
  await first.submit(draft);
  assert.throws(() => second.newTask(), /another|Another/);
  const reconnected = new TaskClient({ machine: '', storage: retained, transport });
  assert.equal(reconnected.retained.submission.id, first.retained.submission.id);
});

test('retained adoption keeps its control endpoint and target after a confirmed submission is cleared', async () => {
  const retained = storage();
  let submitted;
  let target = 'synthetic';
  const transport = async (_machine, operation, request) => {
    if (operation === 'snapshot') return { taskContract: supported(target), tasks: submitted ? [submitted] : [] };
    if (operation === 'task-adopt') throw new Error('Synthetic lost adoption reply.');
    if (operation === 'task-select') submitted = { ...submitted, selection: { terminal: request.terminal, identity: 'synthetic-opaque-selection' } };
    else submitted = { ...request, owner: 'synthetic', delivery: { state: 'delivered' }, acceptance: { state: 'accepted' } };
    return submitted;
  };
  const client = new TaskClient({ machine: '', controlPath: '/synthetic/control.mjs', storage: retained, transport });
  await client.submit(draft);
  await assert.rejects(client.adopt(submitted.id, 't-synthetic'), /lost adoption reply/);
  client.newTask();
  const changedPath = new TaskClient({ machine: '', controlPath: '/different/control.mjs', storage: retained, transport });
  await assert.rejects(changedPath.retryAdoption(), /control path/);
  target = 'another-pot';
  const changedTarget = new TaskClient({ machine: '', controlPath: '/synthetic/control.mjs', storage: retained, transport });
  await assert.rejects(changedTarget.retryAdoption(), /target/);
});
