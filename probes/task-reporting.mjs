import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TaskClient } from '../config/mods/task-handover/task-client.js';
import { fixture, existingExecution, integratedTransport, memoryStorage, SANDBOX_CONTROL } from './sandbox-fixture.mjs';

const draft = { text: 'Produce the synthetic report.', author: 'synthetic-author', reference: 'synthetic-thread' };
const connect = (storage, transport) => new TaskClient({ machine: '', controlPath: SANDBOX_CONTROL, storage, transport });

async function registeredTask(t) {
  const boundary = fixture(t);
  const { folder, control, patch } = boundary;
  const { transport } = integratedTransport(folder);
  const { terminal, sessionFile, transcript } = existingExecution(folder);
  const name = 'pots-synthetic-registered';
  const record = { name, owner: 'synthetic', launchId: 'synthetic-existing-launch', terminal: terminal.address,
    worktree: terminal.cwd, sessionFile, sessionId: 'synthetic-session', createdAt: terminal.created_ms };
  const records = join(folder, '.config/agent-sandbox/workers');
  mkdirSync(records, { recursive: true });
  const workerPath = join(records, `${name}.json`);
  writeFileSync(workerPath, JSON.stringify(record));
  patch({ terminals: [{ ...terminal, name, status: 'idle', turn: 5, labels: { ...terminal.labels,
    'pots.owner': record.owner, 'pots.launch': record.launchId } }] });
  const storage = memoryStorage();
  const submitted = await connect(storage, transport).submit(draft);
  control('task-decide', { id: submitted.id, state: 'accepted', reason: 'Use the existing synthetic worker.' });
  const association = { id: submitted.id, worker: name };
  const first = control('task-associate', association);
  const client = connect(storage, transport);
  return { ...boundary, first, association, client, record, workerPath, sessionFile, transcript };
}

test('readback of an already registered worker preserves its owner and session history', async t => {
  const { client, control, read, first, association, record, workerPath, sessionFile, transcript } = await registeredTask(t);
  assert.deepEqual(control('task-associate', association), first);
  const snapshot = await client.refresh();
  assert.deepEqual(snapshot.tasks, [first]);
  assert.equal(first.owner, record.owner);
  assert.equal(first.execution.worker, record.name);
  assert.equal(first.execution.sessionId, record.sessionId);
  assert.equal(first.execution.sessionFile, sessionFile);
  assert.deepEqual(snapshot.workers.map(worker => [worker.name, worker.owner, worker.taskId]), [[record.name, record.owner, first.id]]);
  assert.deepEqual(snapshot.standaloneExecutions, []);
  assert.deepEqual(JSON.parse(readFileSync(workerPath, 'utf8')), record);
  assert.equal(readFileSync(sessionFile, 'utf8'), transcript);
  assert.equal(read().calls.some(call => call.binary === 'hc' && ['run', 'send', 'kill', 'rm'].includes(call.args[0])), false);
});

function fixtureCommand(invoke, file, args, input) {
  const result = invoke(file, args, input);
  assert.equal(result.status, 0, result.stderr);
  if (result.stdout) return JSON.parse(result.stdout);
}

const reportsFor = read => read().wakes.filter(wake => wake.note.kind === 'task-report');

test('Herdr reads one broker wait across lost notice and report replies until settlement', async t => {
  const { client, invoke, read, patch, record, workerStep } = await registeredTask(t);
  workerStep('settle');
  const source = { type: 'worker', worker: record.name, session: record.sessionFile, call: 'synthetic-call' };
  const dialog = fixtureCommand(invoke, 'session/human.mjs', ['open'], JSON.stringify({ kind: 'question', policy: 'ordinary', source,
    questions: [{ id: 'format', prompt: 'Which synthetic format?' }] }));
  workerStep('inspect');
  workerStep('relay');
  const uncertain = (await client.refresh()).tasks[0].execution;
  assert.equal(uncertain.status, 'blocked');
  assert.equal(uncertain.observedStatus, 'idle');
  const { startedAt, ...wait } = uncertain.wait;
  assert.ok(Number.isSafeInteger(startedAt));
  assert.deepEqual(wait, { kind: 'human', owner: record.owner, dialog: dialog.id, action: 'question',
    delivery: { id: 'synthetic.12345678', state: 'unknown' } });
  workerStep('relay');
  workerStep('relay');
  const waiting = (await client.refresh()).tasks[0];
  assert.deepEqual(waiting.execution.wait, { ...uncertain.wait, delivery: { ...uncertain.wait.delivery, state: 'open' } });
  assert.deepEqual(read().noticeAttempts, [uncertain.wait.delivery.id, uncertain.wait.delivery.id]);
  patch({ loseReply: true });
  assert.equal(invoke('probes/fixtures/task-worker.mjs', ['report']).status, 1);
  workerStep('report');
  workerStep('report');
  assert.deepEqual(reportsFor(read).map(report => report.note.task), [waiting]);
  const answer = JSON.stringify({ answers: [{ id: 'format', labels: [], text: 'Plain text.' }] });
  const response = fixtureCommand(invoke, 'session/human.mjs', ['answer', dialog.id], answer);
  assert.deepEqual(fixtureCommand(invoke, 'session/human.mjs', ['answer', dialog.id], answer).result, response.result);
  workerStep('report');
  const resumed = (await client.refresh()).tasks[0];
  assert.equal(resumed.execution.wait, undefined);
  assert.equal(resumed.execution.status, 'idle');
  assert.deepEqual(reportsFor(read).at(-1).note.task, resumed);
});

test('Herdr reads internal waits and managed delivery receipts without inferring them from terminal status', async t => {
  const { client, folder, invoke, read, record, workerStep } = await registeredTask(t);
  workerStep('settle');
  const startedAt = 1700000000000;
  fixtureCommand(invoke, 'probes/fixtures/task-worker.mjs', ['runtime-wait'], String(startedAt));
  const waiting = (await client.refresh()).tasks[0].execution;
  assert.equal(waiting.observedStatus, 'idle');
  assert.equal(waiting.status, 'waiting');
  assert.deepEqual(waiting.wait, { kind: 'internal', owner: record.owner, startedAt });
  workerStep('settle');
  const note = join(folder, 'follow-up.md');
  writeFileSync(note, 'Return the synthetic evidence.');
  fixtureCommand(invoke, 'session/dispatch.mjs', ['send', record.name, note]);
  const [queued] = (await client.refresh()).tasks[0].execution.deliveries;
  assert.equal(queued.state, 'queued');
  workerStep('serve');
  workerStep('serve');
  const pending = (await client.refresh()).tasks[0];
  assert.equal(pending.execution.status, 'waiting');
  assert.equal(pending.execution.wait, undefined);
  const sent = { id: queued.id, sentTo: record.launchId, state: 'sent' };
  assert.deepEqual(pending.execution.deliveries, [sent]);
  const sends = read().calls.filter(call => call.binary === 'hc' && call.args[0] === 'send');
  assert.equal(sends.length, 1);
  workerStep('report');
  assert.deepEqual(reportsFor(read).at(-1).note.task, pending);
  fixtureCommand(invoke, 'probes/fixtures/task-worker.mjs', ['receive'], sends[0].args.at(-1));
  assert.deepEqual((await client.refresh()).tasks[0].execution.deliveries, [{ ...sent, state: 'received' }]);
  workerStep('serve');
  assert.deepEqual((await client.refresh()).tasks[0].execution.deliveries, []);
});
