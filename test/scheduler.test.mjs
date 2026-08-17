// ====================================================================
// Athena Chrome Bridge — testes do agendador (node:test)
// Rode: node --test test/scheduler.test.mjs
// ====================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun } from '../extension/scheduler.js';

const R = (s, now) => nextRun({ enabled: true, schedule: s }, Date.parse(now));

test('tarefa "once" no futuro retorna o instante', () => {
  assert.equal(R({ type: 'once', date: '2026-08-20', time: '09:00', tz: 'UTC', endDate: null }, '2026-08-17T00:00:00Z'),
    Date.parse('2026-08-20T09:00:00Z'));
});

test('once no passado → null', () => {
  assert.equal(R({ type: 'once', date: '2026-08-01', time: '09:00', tz: 'UTC', endDate: null }, '2026-08-17T00:00:00Z'), null);
});

test('daily: roda hoje se o horário ainda não passou', () => {
  assert.equal(R({ type: 'daily', date: '2026-08-17', time: '09:00', tz: 'UTC', endDate: null }, '2026-08-17T08:00:00Z'),
    Date.parse('2026-08-17T09:00:00Z'));
});

test('daily: amanhã se o horário já passou', () => {
  assert.equal(R({ type: 'daily', date: '2026-08-17', time: '09:00', tz: 'UTC', endDate: null }, '2026-08-17T10:00:00Z'),
    Date.parse('2026-08-18T09:00:00Z'));
});

test('weekly: próximo dia útil (domingo → segunda)', () => {
  assert.equal(R({ type: 'weekly', date: '2026-08-17', time: '09:00', weekdays: [1, 2, 3, 4, 5], tz: 'UTC', endDate: null }, '2026-08-16T23:00:00Z'),
    Date.parse('2026-08-17T09:00:00Z'));
});

test('weekly: pula fim de semana (sábado → segunda)', () => {
  assert.equal(R({ type: 'weekly', date: '2026-08-17', time: '09:00', weekdays: [1, 2, 3, 4, 5], tz: 'UTC', endDate: null }, '2026-08-15T10:00:00Z'),
    Date.parse('2026-08-17T09:00:00Z'));
});

test('monthly: dia 15 (já passou → próximo mês)', () => {
  assert.equal(R({ type: 'monthly', date: '2026-08-17', time: '10:00', dayOfMonth: 15, tz: 'UTC', endDate: null }, '2026-08-16T00:00:00Z'),
    Date.parse('2026-09-15T10:00:00Z'));
});

test('endDate passado → null', () => {
  assert.equal(R({ type: 'daily', date: '2026-01-01', time: '09:00', tz: 'UTC', endDate: '2026-06-30' }, '2026-08-17T00:00:00Z'), null);
});

test('desabilitada → null', () => {
  assert.equal(nextRun({ enabled: false, schedule: { type: 'daily', date: '2026-08-17', time: '09:00', tz: 'UTC', endDate: null } },
    Date.parse('2026-08-17T08:00:00Z')), null);
});

test('timezone America/Sao_Paulo (UTC-3, sem DST)', () => {
  assert.equal(R({ type: 'once', date: '2026-08-20', time: '09:00', tz: 'America/Sao_Paulo', endDate: null }, '2026-08-17T00:00:00Z'),
    Date.parse('2026-08-20T12:00:00Z'));
});

test('timezone com DST (America/New_York, agosto = UTC-4)', () => {
  assert.equal(R({ type: 'once', date: '2026-08-20', time: '09:00', tz: 'America/New_York', endDate: null }, '2026-08-17T00:00:00Z'),
    Date.parse('2026-08-20T13:00:00Z'));
});
