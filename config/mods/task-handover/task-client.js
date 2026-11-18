export const SUPPORTED_TASK_VERSION = 1;
const OPERATIONS = ['task-submit', 'task-adopt'];
const STORAGE_PREFIX = 'herdr.task-handover.';
const identity = () => `herdr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function capability(snapshot) {
  const contract = snapshot?.taskContract;
  if (contract?.version !== SUPPORTED_TASK_VERSION || typeof contract.target !== 'string' || !contract.target ||
      !Array.isArray(contract.operations) || !OPERATIONS.every(operation => contract.operations.includes(operation)) || !Array.isArray(snapshot.tasks)) {
    throw new Error('This pot needs its compatible task handover rollout. Submission is disabled.');
  }
  return contract;
}

function taskReply(row, target) {
  if (row?.version !== SUPPORTED_TASK_VERSION || row.owner !== target || row.target !== target ||
      typeof row.id !== 'string' || !row.delivery?.state || !row.acceptance?.state) {
    throw new Error('Incompatible task reply. Refresh after the compatible sandbox rollout.');
  }
  return row;
}

function matchesSubmission(row, submission) {
  return row.id === submission.id && row.target === submission.target && row.text === submission.text &&
    same(row.provenance, submission.provenance);
}

export class TaskClient {
  constructor({ machine, controlPath, storage, transport }) {
    this.machine = machine;
    this.controlPath = controlPath;
    this.storage = storage;
    this.transport = transport;
    this.key = `${STORAGE_PREFIX}${JSON.stringify(machine)}`;
    this.snapshot = { tasks: [] };
    this.target = '';
    this.retained = JSON.parse(storage.getItem(this.key) ?? '{}');
  }

  persist(retained) {
    const latest = JSON.parse(this.storage.getItem(this.key) ?? '{}');
    if (!same(latest, this.retained)) throw new Error('Another Herdr dialog changed the retained request. Reconnect before changing it.');
    this.storage.setItem(this.key, JSON.stringify(retained));
    this.retained = retained;
  }

  async refresh() {
    if (this.retained.controlPath && this.retained.controlPath !== this.controlPath) {
      throw new Error('Restore the original control path before retrying its retained request.');
    }
    const snapshot = await this.transport(this.machine, 'snapshot');
    const contract = capability(snapshot);
    const pinned = this.retained.target ?? this.target;
    if (pinned && pinned !== contract.target) throw new Error('The pot target changed. Retained requests cannot be sent to another target.');
    snapshot.tasks.forEach(row => taskReply(row, contract.target));
    this.target = contract.target;
    this.snapshot = snapshot;
    return snapshot;
  }

  async submit({ text, author, reference }) {
    await this.refresh();
    const retained = JSON.parse(this.storage.getItem(this.key) ?? '{}');
    if (retained.submission) throw new Error('A request is retained. Retry it or choose New task after its delivery is confirmed.');
    if (![text, author, reference].every(value => typeof value === 'string' && value.trim())) {
      throw new Error('Enter task context, claimed author and source reference before sending.');
    }
    const submission = { version: SUPPORTED_TASK_VERSION, id: identity(), target: this.target, text,
      provenance: { source: 'herdr', author, reference } };
    this.persist({ ...retained, target: this.target, controlPath: this.controlPath, submission });
    return this.deliver(submission);
  }

  async retry() {
    await this.refresh();
    if (!this.retained.submission) throw new Error('There is no retained submission to retry.');
    return this.deliver(this.retained.submission);
  }

  async deliver(submission) {
    const row = taskReply(await this.transport(this.machine, 'task-submit', submission), this.target);
    if (!matchesSubmission(row, submission)) throw new Error('The reply differs from the retained submission. Refresh without creating a replacement.');
    this.snapshot = { ...this.snapshot, tasks: [...this.snapshot.tasks.filter(task => task.id !== row.id), row] };
    return row;
  }

  canStartAnother() {
    const submission = this.retained.submission;
    if (!submission) return true;
    return this.snapshot.tasks.some(row => matchesSubmission(row, submission) && row.delivery.state === 'delivered');
  }

  newTask() {
    if (!this.canStartAnother()) throw new Error('Refresh or retry the retained request until delivery is confirmed.');
    const { submission, ...retained } = this.retained;
    this.persist(retained);
  }

  async adopt(id, terminal) {
    if (typeof terminal !== 'string' || !terminal.trim()) throw new Error('Choose an exact local terminal address before adoption.');
    await this.refresh();
    const row = this.snapshot.tasks.find(task => task.id === id);
    if (row?.acceptance.state !== 'accepted') throw new Error('The owning coordinator must accept this task before adoption.');
    const adoption = { version: SUPPORTED_TASK_VERSION, id, terminal };
    if (this.retained.adoption && !same(this.retained.adoption, adoption)) {
      throw new Error('Retry the retained adoption before choosing a different execution.');
    }
    this.persist({ ...this.retained, target: this.target, controlPath: this.controlPath, adoption });
    return this.retryAdoption();
  }

  async retryAdoption() {
    await this.refresh();
    const adoption = this.retained.adoption;
    if (!adoption) throw new Error('There is no retained adoption to retry.');
    const row = taskReply(await this.transport(this.machine, 'task-adopt', adoption), this.target);
    if (row.id !== adoption.id || row.execution?.terminal !== adoption.terminal) {
      throw new Error('The adoption reply differs from the retained execution. Inspect the task before retrying.');
    }
    this.snapshot = { ...this.snapshot, tasks: [...this.snapshot.tasks.filter(task => task.id !== row.id), row] };
    const { adoption: completed, ...retained } = this.retained;
    this.persist(retained);
    return row;
  }
}
