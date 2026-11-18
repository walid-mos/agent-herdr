import { div } from 'gpui-kit';
import { Button, Input, Textarea, h_flex, v_flex } from 'gpui-base';
import { theme } from 'herdr';

export const TYPE = { body: 14, small: 13, heading: 16 };

export function text(value) {
  return div().text_size(TYPE.body).text_color(theme().foreground).child(String(value));
}

export function button(id, label, action, { isDisabled = false } = {}) {
  const colors = theme();
  return Button.new(id).min_h(32).px(10).rounded(6).flex_none().disabled(isDisabled)
    .accessibility_label(label).text_size(TYPE.small).text_color(isDisabled ? colors.dim : colors.foreground)
    .border_1().border_color(colors.border).bg(colors.chrome).hover(style => style.bg(colors.hover))
    .focus(style => style.border(2).border_color(colors.accent)).on_click(action).child(label);
}

export function field(label, input) {
  return v_flex().w_full().gap(4).child(text(label))
    .child(Input.new(input).accessibility_label(label).w_full().min_h(32).px(8).text_size(TYPE.body)
      .border_1().border_color(theme().border).rounded(6));
}

export function contextField(input) {
  return v_flex().w_full().gap(4).child(text('Task context'))
    .child(Textarea.new(input).accessibility_label('Task context').w_full().min_h(96).px(8).text_size(TYPE.body)
      .border_1().border_color(theme().border).rounded(6));
}

function fact(label, value) {
  return value === undefined ? [] : [text(`${label}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)];
}

function timeFact(label, milliseconds) {
  if (typeof milliseconds !== 'number') return [];
  const time = new Date(milliseconds);
  return Number.isFinite(time.getTime()) ? fact(label, time.toISOString()) : [];
}

export function taskFacts(task) {
  const execution = task.execution;
  return v_flex().w_full().gap(6)
    .child(text(`Task ${task.id}`).font_semibold())
    .child(text(`Owner: ${task.owner}`))
    .child(text(`Delivery: ${task.delivery.state}`))
    .children(fact('Intake receipt', task.receipt))
    .children(timeFact('Received at (UTC)', task.receivedAt))
    .child(text(`Acceptance: ${task.acceptance.state}`))
    .children(fact('Decision by', task.acceptance.by))
    .children(timeFact('Decision at (UTC)', task.acceptance.at))
    .children(fact('Coordinator reason', task.acceptance.reason))
    .children(fact('Pinned terminal', task.selection?.terminal))
    .child(text(task.text))
    .child(text(`Claimed provenance: ${task.provenance.source} / ${task.provenance.author} / ${task.provenance.reference}`))
    .when(Boolean(execution), element => element.children(executionFacts(execution)));
}

function executionFacts(execution) {
  return [
    ...fact('Worker', execution.worker), ...fact('Execution', execution.mode), ...fact('Observed status', execution.status),
    ...fact('Terminal', execution.terminal), ...fact('Conversation', execution.sessionId), ...fact('Session file', execution.sessionFile),
    ...fact('Native parent', execution.parent), ...fact('Failure', execution.failure), ...fact('Branch', execution.branch),
    ...fact('Commit', execution.commit), ...fact('Uncommitted', execution.uncommitted), ...fact('Unpushed', execution.unpushed),
    ...fact('Clean pass', execution.cleanPass), ...fact('Pull request', execution.pullRequest),
    ...execution.deliveries.map(delivery => text(`Follow-up ${delivery.id}: ${delivery.state}`)),
    ...resultFacts(execution.result),
  ];
}

function resultFacts(result) {
  if (!result) return [];
  return [text(`Saved result: ${result.id}`), ...fact('Result state', result.state), ...fact('Result kind', result.kind),
    ...fact('Coordinator summary', result.summary), ...fact('Conversation digest', result.sessionDigest),
    ...fact('Saved screen', result.screen), ...fact('Saved transcript', result.transcript)];
}

export const row = () => h_flex().w_full().gap(8).items_center();
