// ====================================================================
// Athena Chrome Bridge — testes do agendador (node:test)
// Rode: node --test test/scheduler.test.mjs
// ====================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun } from '../extension/scheduler.js';

test('tarefa "once" no futuro retorna o instante', () => {
  const task = { enabled: true, schedule: { type: 'once', date: '2026-08-20', time: '09:00', tz: 'UTC', endDate: null } };
  const t = nextRun(task, Date.parse('2026-08-17T00:00:00Z'));
  assert.equal(t, Date.parse('2026-08-20T09:00:00Z'));
});
