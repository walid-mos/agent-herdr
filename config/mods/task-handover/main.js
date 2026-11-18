import { View } from 'gpui-kit';
import { InputState, TextareaState, v_flex } from 'gpui-base';
import { appHome, closeOverlay, exec, machines, props, run, terminals, theme, writeTextFile } from 'herdr';
import { TaskClient } from './task-client.js';
import { taskTransport } from './control.js';
import { button, contextField, field, row, taskFacts, text, TYPE } from './presentation.js';

const REFRESH_MS = 5000;
const CONNECTIONS = 'herdr.task-handover.connections';
const machineOf = address => address.includes('/') ? address.slice(0, address.lastIndexOf('/')) : '';
const localAddress = address => address.slice(address.lastIndexOf('/') + 1);

export default class TaskHandover extends View {
  init(_props, cx) {
    this.machine = '';
    this.selected = '';
    this.isBusy = false;
    this.error = '';
    this.controlPath = InputState.new({ placeholder: 'Absolute installed control path on this pot' });
    this.context = TextareaState.new({ placeholder: 'Describe the work and preserve relevant conversation context.' });
    this.context.set_auto_grow(3, 8);
    this.author = InputState.new({ placeholder: 'Claimed author' });
    this.reference = InputState.new({ placeholder: 'Conversation or source reference' });
    this.terminal = InputState.new({ placeholder: 'Exact local address on the selected pot' });
    this.handle = cx.focus_handle();
    this.choose('', cx);
    cx.timer.every(REFRESH_MS, cx => {
      if (this.client?.target && !this.isBusy && !this.error) this.perform(cx, () => this.client.refresh());
    });
  }

  perform(cx, action) {
    if (this.isBusy) return;
    this.isBusy = true;
    this.error = '';
    cx.notify();
    cx.spawn(async cx => {
      try {
        const result = await action();
        if (result?.id) this.selected = result.id;
      }
      catch (error) { this.error = `${error.message} Refresh before retrying. The original request, if prepared, remains retained.`; }
      finally { this.isBusy = false; cx.notify(); }
    });
  }

  choose(machine, cx) {
    this.perform(cx, async () => {
      this.machine = machine;
      this.selected = '';
      this.terminal.set_value('');
      this.client = undefined;
      const connections = JSON.parse(localStorage.getItem(CONNECTIONS) ?? '{}');
      const path = connections[machine] ?? '';
      this.controlPath.set_value(path);
      if (path) await this.connectPath(path);
    });
  }

  async connectPath(controlPath) {
    const transport = taskTransport({ exec, appHome, writeTextFile }, controlPath);
    this.client = new TaskClient({ machine: this.machine, controlPath, transport, storage: localStorage });
    await this.client.refresh();
    const connections = JSON.parse(localStorage.getItem(CONNECTIONS) ?? '{}');
    localStorage.setItem(CONNECTIONS, JSON.stringify({ ...connections, [this.machine]: controlPath }));
    this.selected = this.client.retained.selectionRequest?.id ?? this.client.retained.adoption?.id ?? this.client.retained.submission?.id ?? this.client.snapshot.tasks[0]?.id ?? '';
  }

  send(cx) {
    this.perform(cx, () => this.client.submit({ text: this.context.value(), author: this.author.value(), reference: this.reference.value() }));
  }

  newTask(cx) {
    this.perform(cx, async () => {
      await this.client.refresh();
      this.client.newTask();
      this.selected = '';
      this.context.set_value('');
      this.context.focus();
    });
  }

  openExecution(task) {
    const terminal = `${this.machine ? `${this.machine}/` : ''}${task.execution.terminal}`;
    run('terminal.peek', { terminal });
  }

  machines() {
    const choices = [...new Set(['', ...machines().map(machine => machine.name ?? '')])];
    return v_flex().w_full().gap(6).child(text('Owning pot computer'))
      .children(choices.map((machine, index) => button(`task-machine-${index}`,
        `${machine || 'This computer'}${this.machine === machine ? ' / selected' : ''}`,
        (_event, cx) => this.choose(machine, cx), { isDisabled: this.isBusy })))
      .child(field('Installed control path on this pot', this.controlPath))
      .child(button('task-connect', 'Connect to selected pot', (_event, cx) => this.perform(cx,
        () => this.connectPath(this.controlPath.value())), { isDisabled: this.isBusy }));
  }

  composer() {
    const retained = this.client?.retained.submission;
    if (retained) return v_flex().w_full().gap(8)
      .child(text(`Retained request ${retained.id} for ${retained.target}`))
      .child(text(retained.text))
      .child(button('task-retry', 'Retry original submission', (_event, cx) => this.perform(cx, () => this.client.retry()), { isDisabled: this.isBusy }))
      .child(button('task-new', 'New task', (_event, cx) => this.newTask(cx), { isDisabled: this.isBusy || !this.client.canStartAnother() }));
    return v_flex().w_full().gap(8).child(contextField(this.context))
      .child(field('Claimed author', this.author)).child(field('Source reference', this.reference))
      .child(button('task-send', 'Send task to owning pot', (_event, cx) => this.send(cx), { isDisabled: this.isBusy || !this.client?.target }));
  }

  adoption(task) {
    const request = this.client.retained.selectionRequest;
    const adoption = this.client.retained.adoption;
    if (request || adoption) return v_flex().w_full().gap(8)
      .child(text(`Retained choice ${request?.id ?? adoption.id} / ${request?.terminal ?? 'selection acknowledgment unavailable'}`))
      .child(text(adoption ? 'The original selection is retained. Retry never chooses a new conversation.' : 'The selection reply is unconfirmed. Recover its saved fingerprint before adoption.'))
      .child(button('task-adopt-retry', adoption ? 'Retry pinned adoption' : 'Recover selection and adopt',
        (_event, cx) => this.perform(cx, () => this.client.retryAdoption()), { isDisabled: this.isBusy }));
    if (task.acceptance.state !== 'accepted' || task.execution) return text('The owning coordinator accepts the task and chooses its worker.');
    const available = terminals().filter(terminal => machineOf(terminal.address) === this.machine);
    return v_flex().w_full().gap(8)
      .child(text('Pin the exact conversation before adoption. No replacement is launched and its native parent stays unchanged.'))
      .children(available.map((terminal, index) => button(`task-terminal-${index}`, terminal.address,
        (_event, cx) => { this.terminal.set_value(localAddress(terminal.address)); cx.notify(); }, { isDisabled: this.isBusy })))
      .child(field('Exact local terminal address', this.terminal))
      .child(button('task-adopt', 'Pin and adopt exact terminal', (_event, cx) => this.perform(cx,
        () => this.client.adopt(task.id, this.terminal.value())), { isDisabled: this.isBusy }));
  }

  details(task) {
    return v_flex().w_full().gap(12).child(taskFacts(task)).child(this.adoption(task))
      .when(Boolean(task.execution?.terminal), element => element.child(button('task-open', 'Open associated terminal',
        () => this.openExecution(task), { isDisabled: this.isBusy })))
      .child(button('task-copy', 'Copy observed task facts', (_event, cx) => cx.write_to_clipboard(JSON.stringify(task, null, 2))));
  }

  render() {
    const tasks = this.client?.snapshot.tasks ?? [];
    const selected = tasks.find(task => task.id === this.selected);
    return v_flex().id('task-handover').track_focus(this.handle).w_full().max_h(720).min_h(0).p(16).gap(12)
      .bg(theme().popover).text_size(TYPE.body).on_key_down(event => {
        if (event.key === 'escape') closeOverlay(props().overlay);
      })
      .child(row().child(text('Pot tasks').text_size(TYPE.heading).font_semibold().flex_1())
        .child(button('task-close', 'Close', () => closeOverlay(props().overlay))))
      .child(text('Sending delivers context. Only the owning coordinator can accept it. Provenance grants no push, spend or account permission.'))
      .child(v_flex().id('task-content').w_full().min_h(0).overflow_y_scrollbar().gap(12)
        .child(this.machines())
        .child(text(this.client?.target ? `Connected target: ${this.client.target}` : 'Task capability has not been confirmed.'))
        .child(button('task-refresh', this.isBusy ? 'Waiting for pot control' : 'Refresh task facts',
          (_event, cx) => this.client ? this.perform(cx, () => this.client.refresh()) : this.choose(this.machine, cx), { isDisabled: this.isBusy }))
        .when(Boolean(this.error), element => element.child(text(`Observation failed: ${this.error}`).text_color(theme().blocked)))
        .child(this.composer())
        .child(text('Tasks from the last successful observation').font_semibold())
        .when(!tasks.length, element => element.child(text('No task facts observed. An unavailable connection does not prove that a submission was absent.')))
        .children(tasks.map((task, index) => button(`task-select-${index}`, `${task.id} / ${task.acceptance.state}`,
          (_event, cx) => { this.selected = task.id; cx.notify(); }, { isDisabled: this.isBusy })))
        .when(Boolean(selected), element => element.child(this.details(selected))));
  }
}
