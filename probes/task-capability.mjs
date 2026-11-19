import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskClient } from '../config/mods/task-handover/task-client.js';
import { fixture, integratedTransport, diskStorage, SANDBOX_CONTROL } from './sandbox-fixture.mjs';

for (const incompatibility of ['old v1 capability', 'missing task-select']) {
  test(`real-control capability drift refuses ${incompatibility} before intake`, async t => {
    const { folder, control, read } = fixture(t);
    const { transport } = integratedTransport(folder);
    const requests = [];
    const client = new TaskClient({ machine: '', controlPath: SANDBOX_CONTROL, storage: diskStorage(folder),
      transport: async (...arguments_) => {
        requests.push(arguments_[1]);
        const reply = await transport(...arguments_);
        if (incompatibility === 'old v1 capability') reply.taskContract.version = 1;
        else reply.taskContract.operations = reply.taskContract.operations.filter(operation => operation !== 'task-select');
        return reply;
      } });
    await assert.rejects(client.submit({ text: 'Synthetic context.', author: 'synthetic-person', reference: 'synthetic-thread' }), /rollout/);
    assert.deepEqual(requests, ['snapshot']);
    assert.equal(control('snapshot').tasks.length, 0);
    assert.equal(read().wakes.length, 0);
    assert.equal(read().calls.some(call => call.binary === 'hc' && ['run', 'send', 'kill', 'rm'].includes(call.args[0])), false);
  });
}

test('a retained v1 submission is refused without changing its payload or sending a task request', async t => {
  const { folder, read } = fixture(t);
  const { transport } = integratedTransport(folder);
  const storage = diskStorage(folder);
  const client = new TaskClient({ machine: '', controlPath: SANDBOX_CONTROL, storage, transport: async (...arguments_) => {
    if (arguments_[1] === 'task-submit') throw new Error('Synthetic lost submission reply.');
    return transport(...arguments_);
  } });
  await assert.rejects(client.submit({ text: 'Synthetic context.', author: 'synthetic-person', reference: 'synthetic-thread' }), /lost submission reply/);
  const retained = JSON.parse(storage.getItem(client.key));
  retained.submission.version = 1;
  storage.setItem(client.key, JSON.stringify(retained));
  const requests = [];
  const resumed = new TaskClient({ machine: '', controlPath: SANDBOX_CONTROL, storage, transport: async (...arguments_) => {
    requests.push(arguments_[1]);
    return transport(...arguments_);
  } });
  await assert.rejects(resumed.retry(), /unsupported version/);
  assert.deepEqual(requests, ['snapshot']);
  assert.deepEqual(JSON.parse(storage.getItem(client.key)), retained);
  assert.equal(read().wakes.length, 0);
});
