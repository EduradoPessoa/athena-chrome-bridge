# Task Scheduler (Agendamento de Tarefas) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Permitir que a Athena Chrome Bridge execute tarefas **automaticamente em data/hora com recorrência**, usando contexto, memória e credenciais de acesso a sites armazenadas com segurança (cofre com senha-mestre).

**Architecture:** O agendador roda no service worker (MV3) com heartbeat via `chrome.alarms` (mín. 30s). Tarefas ficam em `chrome.storage.local`; credenciais ficam criptografadas (AES-GCM 256, chave PBKDF2 derivada de senha-mestre mantida só em memória). O executor abre uma aba no grupo Athena e roda passos determinísticos (navigate/fill/click/login) ou um prompt de IA (modo `ai`, que injeta contexto + memória). Lógica pura (recorrência e cofre) vive em módulos sem dependência de Chrome para permitir TDD com `node --test`.

**Tech Stack:** Chrome Extensions MV3 (`chrome.alarms`, `storage`, `tabs`, `scripting`, `notifications`), WebCrypto (`PBKDF2` + `AES-GCM`), Node.js 22 (`node:test`, WebCrypto global) para testes da lógica pura.

**Non-goals (YAGNI):** sincronização multi-dispositivo, execução com Chrome fechado, fila paralela, UI de arrastar-e-soltar, exposição de senhas à IA.

---

## Decisões de segurança (vínculo do produto)

1. **Vault com senha-mestre:** credenciais são criptografadas com AES-GCM 256; a chave é derivada de uma senha-mestre via PBKDF2-SHA256 (150.000 iterações) + salt aleatório. A chave vive **apenas na memória** do service worker.
2. **Auto-lock:** ao reiniciar o service worker / abrir o Chrome, o cofre volta a `locked`. Tarefas que precisam de `login` ficam `skipped` com motivo `vault_locked` — nunca falham com a senha vazada.
3. **Senhas nunca vão à IA:** o modo `ai` recebe só instrução + contexto + memória. Credenciais são usadas exclusivamente por passos `login` determinísticos (fill + submit no content script).
4. **Sem logs de segredo:** histórico de tarefas guarda status/summary/erro, nunca valores de credenciais.

---

## Modelo de dados (`chrome.storage.local`)

| Chave | Tipo | Descrição |
|---|---|---|
| `athena.tasks` | `Task[]` | Tarefas agendadas |
| `athena.memory` | `Memory[]` | Notas de memória reutilizáveis |
| `athena.credentials` | `Credential[]` | Perfis de login (criptografados no campo `secret`) |
| `athena.vault` | `VaultMeta \| null` | `{salt, iterations, verifier}` do cofre |
| `athena.taskHistory` | `HistoryEntry[]` | Últimas 200 execuções |

```js
// Task
{
  id: 't_<rand>',
  name: 'Login e baixar relatório',
  enabled: true,
  mode: 'script' | 'ai',
  instruction: 'Pegar relatório diário do portal',   // modo ai: instrução
  context: 'Ambiente de produção do cliente X',       // contexto livre
  memoryIds: ['m_1'],                                 // memórias anexadas (modo ai)
  steps: [                                            // modo script
    { type: 'navigate', url: 'https://portal.example' },
    { type: 'login', profileId: 'c_1' },
    { type: 'click', selector: 'a[href="/reports"]' },
    { type: 'screenshot' }
  ],
  closeTab: true,
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly',
    date: '2026-08-20',          // once / início da recorrência
    time: '09:00',               // hora local do timezone
    weekdays: [1,2,3,4,5],       // weekly (1=seg … 7=dom)
    dayOfMonth: 15,              // monthly
    endDate: '2026-12-31' | null,
    tz: 'America/Sao_Paulo'
  },
  createdAt, updatedAt
}

// Credential
{ id: 'c_1', name: 'Portal Cliente X', url: 'https://portal.example',
  userSelector: '#username', passSelector: '#password', submitSelector: 'button[type=submit]',
  secret: { iv: '<b64>', data: '<b64>' } }   // AES-GCM de "user\u0000pass"

// Memory
{ id: 'm_1', key: 'cliente-x', text: 'Login é do gestor financeiro; relatório fica em Relatórios > Diário', tags: ['cliente-x'], createdAt }

// VaultMeta
{ salt: '<b64>', iterations: 150000, verifier: { iv: '<b64>', data: '<b64>' } }

// HistoryEntry
{ taskId, name, startedAt, finishedAt, status: 'ok'|'error'|'skipped', summary, error?, reason? }
```

---

## Estrutura de arquivos (criar/modificar)

```
extension/
├── manifest.json        MODIFICAR  (+ permissão "notifications")
├── background.js        MODIFICAR  (heartbeat, executor, vault state, mensagens)
├── scheduler.js         CRIAR     (lógica pura: recorrência/nextRun)
├── vault.js             CRIAR     (lógica pura: PBKDF2+AES-GCM, WebCrypto)
├── schedule.html/.js    CRIAR     (UI: tarefas + cofre + memória)
├── content.js           MODIFICAR (label de toast para 'login'; sem lógica nova)
├── popup.html/.js       MODIFICAR (botão "Agendamentos" + status do cofre)
└── package.json         CRIAR     (scripts test)
test/
├── scheduler.test.mjs   CRIAR
└── vault.test.mjs       CRIAR
docs/plans/2026-08-17-athena-task-scheduler.md   (este arquivo)
```

---

## Task 1: Scaffold de testes (node:test)

**Files:**
- Create: `extension/package.json`
- Create: `test/scheduler.test.mjs` (primeiro teste)
- Create: `test/vault.test.mjs` (esqueleto)

**Step 1:** Criar `extension/package.json`:
```json
{ "name": "athena-chrome-bridge-extension", "private": true, "type": "module",
  "scripts": { "test": "node --test ../test/" } }
```

**Step 2:** Criar `test/scheduler.test.mjs` com teste que falha (módulo ainda não existe):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun } from '../extension/scheduler.js';

test('tarefa "once" no futuro retorna o instante', () => {
  const task = { enabled: true, schedule: { type: 'once', date: '2026-08-20', time: '09:00', tz: 'UTC', endDate: null } };
  const t = nextRun(task, Date.parse('2026-08-17T00:00:00Z'));
  assert.equal(t, Date.parse('2026-08-20T09:00:00Z'));
});
```

**Step 3:** Rodar e confirmar falha:
`node --test test/scheduler.test.mjs` → `ERR_MODULE_NOT_FOUND ... scheduler.js`

**Step 4:** Criar `extension/scheduler.js` vazio (`export function nextRun(){ throw new Error('not implemented'); }`) e rodar de novo → falha por `AssertionError` (teste vermelho de verdade).

**Step 5:** Commit: `git add extension/package.json test/scheduler.test.mjs extension/scheduler.js` → `git commit -m "test: scaffold node:test para scheduler"`

---

## Task 2: `scheduler.js` — recorrência e nextRun (TDD)

**Files:**
- Create: `extension/scheduler.js` (completo)
- Test: `test/scheduler.test.mjs` (completo)

**Step 1:** Adicionar testes de recorrência (daily/weekly/monthly/endDate/timezone):
```js
test('daily: roda hoje se o horário ainda não passou', () => {
  const task = { enabled: true, schedule: { type: 'daily', date: '2026-08-17', time: '09:00', tz: 'UTC', endDate: null } };
  assert.equal(nextRun(task, Date.parse('2026-08-17T08:00:00Z')), Date.parse('2026-08-17T09:00:00Z'));
});
test('daily: amanhã se o horário já passou', () => {
  const task = { enabled: true, schedule: { type: 'daily', date: '2026-08-17', time: '09:00', tz: 'UTC', endDate: null } };
  assert.equal(nextRun(task, Date.parse('2026-08-17T10:00:00Z')), Date.parse('2026-08-18T09:00:00Z'));
});
test('weekly: próximo dia útil', () => {
  const task = { enabled: true, schedule: { type: 'weekly', date: '2026-08-17', time: '09:00', weekdays: [1,2,3,4,5], tz: 'UTC', endDate: null } };
  // 2026-08-17 é segunda (1). Agora = domingo 23:00 → próximo = segunda 09:00
  assert.equal(nextRun(task, Date.parse('2026-08-16T23:00:00Z')), Date.parse('2026-08-17T09:00:00Z'));
});
test('weekly: pula fim de semana', () => {
  const task = { enabled: true, schedule: { type: 'weekly', date: '2026-08-17', time: '09:00', weekdays: [1,2,3,4,5], tz: 'UTC', endDate: null } };
  // sábado 10:00 → segunda 09:00
  assert.equal(nextRun(task, Date.parse('2026-08-15T10:00:00Z')), Date.parse('2026-08-17T09:00:00Z'));
});
test('monthly: dia 15', () => {
  const task = { enabled: true, schedule: { type: 'monthly', date: '2026-08-17', time: '10:00', dayOfMonth: 15, tz: 'UTC', endDate: null } };
  // 2026-08-16T00:00Z já passou do dia 15/08 → próximo é 15/09
  assert.equal(nextRun(task, Date.parse('2026-08-16T00:00:00Z')), Date.parse('2026-09-15T10:00:00Z'));
});
test('endDate passado → null', () => {
  const task = { enabled: true, schedule: { type: 'daily', date: '2026-01-01', time: '09:00', tz: 'UTC', endDate: '2026-06-30' } };
  assert.equal(nextRun(task, Date.parse('2026-08-17T00:00:00Z')), null);
});
test('once no passado → null', () => {
  const task = { enabled: true, schedule: { type: 'once', date: '2026-08-01', time: '09:00', tz: 'UTC', endDate: null } };
  assert.equal(nextRun(task, Date.parse('2026-08-17T00:00:00Z')), null);
});
test('desabilitada → null', () => {
  const task = { enabled: false, schedule: { type: 'daily', date: '2026-08-17', time: '09:00', tz: 'UTC', endDate: null } };
  assert.equal(nextRun(task, Date.parse('2026-08-17T08:00:00Z')), null);
});
test('timezone America/Sao_Paulo (UTC-3, sem DST)', () => {
  const task = { enabled: true, schedule: { type: 'once', date: '2026-08-20', time: '09:00', tz: 'America/Sao_Paulo', endDate: null } };
  assert.equal(nextRun(task, Date.parse('2026-08-17T00:00:00Z')), Date.parse('2026-08-20T12:00:00Z'));
});
```

**Step 2:** Rodar → todos falham.

**Step 3:** Implementar `extension/scheduler.js` completo:
```js
// ====================================================================
// Athena Chrome Bridge — scheduler.js (lógica pura, testável em Node)
// Recorrência e cálculo de nextRun para tarefas agendadas.
// ====================================================================
export const DAY_MS = 86400000;

export function offsetMs(tz, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(utcMs));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * ((+m[2]) * 3600 + (+(m[3] || 0)) * 60) * 1000;
}

export function zonedTimeToUtc(dateStr, timeStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mi] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, hh, mi, 0);
  const off1 = offsetMs(tz, naive);
  const cand = naive - off1;
  const off2 = offsetMs(tz, cand);
  return cand - (off2 - off1); // corrige DST
}

export function dateStrOf(utcMs, tz) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utcMs));
  return p; // YYYY-MM-DD
}

function startOfDay(utcMs, tz) {
  return zonedTimeToUtc(dateStrOf(utcMs, tz), '00:00', tz);
}

function weekdayOf(utcMs, tz) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(utcMs));
  return { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[w];
}

export function nextRun(task, now = Date.now()) {
  const s = task.schedule;
  if (!s || task.enabled === false) return null;
  const tz = s.tz || 'UTC';
  if (s.endDate && dateStrOf(now, tz) > s.endDate) return null;

  switch (s.type) {
    case 'once': {
      const t = zonedTimeToUtc(s.date, s.time, tz);
      return t > now ? t : null;
    }
    case 'daily': {
      let t = zonedTimeToUtc(dateStrOf(now, tz), s.time, tz);
      if (t <= now) t += DAY_MS;
      if (s.endDate && dateStrOf(t, tz) > s.endDate) return null;
      return t;
    }
    case 'weekly': {
      const days = [...(s.weekdays || [1, 2, 3, 4, 5])].sort((a, b) => a - b);
      for (let i = 0; i < 400; i++) {
        const dayStart = startOfDay(now, tz) + i * DAY_MS;
        if (days.includes(weekdayOf(dayStart, tz))) {
          const t = dayStart + (zonedTimeToUtc(dateStrOf(dayStart, tz), s.time, tz) - dayStart);
          if (t > now && (!s.endDate || dateStrOf(t, tz) <= s.endDate)) return t;
        }
      }
      return null;
    }
    case 'monthly': {
      const dom = Math.min(Math.max(1, s.dayOfMonth || 1), 28); // 28 evita virada de mês
      const base = new Date(now);
      for (let i = 0; i < 24; i++) {
        const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, dom));
        const cand = zonedTimeToUtc(
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
          s.time, tz,
        );
        if (cand > now && (!s.endDate || dateStrOf(cand, tz) <= s.endDate)) return cand;
      }
      return null;
    }
    default:
      return null;
  }
}

export function scheduleSummary(s) {
  const t = s.time || '00:00';
  const tz = s.tz || 'UTC';
  switch (s.type) {
    case 'once': return `${s.date} ${t} (uma vez)`;
    case 'daily': return `Diariamente ${t} (${tz})`;
    case 'weekly': return `Semanal ${s.weekdays?.length ? `dias ${s.weekdays.join(',')}` : ''} ${t}`;
    case 'monthly': return `Mensal dia ${s.dayOfMonth} ${t}`;
    default: return '—';
  }
}
```

**Step 4:** Rodar `node --test test/scheduler.test.mjs` → **todos PASS**.

**Step 5:** Commit: `git commit -am "feat(scheduler): recurrencia e nextRun com testes"`

---

## Task 3: `vault.js` — cofre com senha-mestre (TDD)

**Files:**
- Create: `extension/vault.js`
- Test: `test/vault.test.mjs`

**Step 1:** Testes:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVault, unlock, lock, encryptSecret, decryptSecret } from '../extension/vault.js';

test('createVault + unlock com senha certa', async () => {
  const meta = await createVault('Senha@123');
  const key = await unlock('Senha@123', meta);
  assert.ok(key instanceof CryptoKey);
});
test('unlock com senha errada → null', async () => {
  const meta = await createVault('Senha@123');
  assert.equal(await unlock('errada', meta), null);
});
test('encrypt/decrypt roundtrip', async () => {
  const meta = await createVault('Senha@123');
  const key = await unlock('Senha@123', meta);
  const blob = await encryptSecret(key, 'usuario\u0000minha-senha');
  assert.notEqual(blob.data, 'usuario\u0000minha-senha');
  assert.equal(await decryptSecret(key, blob), 'usuario\u0000minha-senha');
});
test('decrypt com chave errada falha (AES-GCM autentica)', async () => {
  const metaA = await createVault('Senha@123');
  const metaB = await createVault('Outra@456');
  const keyB = await unlock('Outra@456', metaB);
  const blob = await encryptSecret(await unlock('Senha@123', metaA), 'segredo');
  await assert.rejects(() => decryptSecret(keyB, blob));
});
```

**Step 2:** Rodar → falha (módulo ausente).

**Step 3:** Implementar `extension/vault.js`:
```js
// ====================================================================
// Athena Chrome Bridge — vault.js (WebCrypto; testável em Node 22+)
// Cofre de credenciais: PBKDF2-SHA256 (150k) + AES-GCM 256.
// A chave NUNCA é persistida — fica só em memória enquanto desbloqueado.
// ====================================================================
export const ITERATIONS = 150000;
const VERIFIER_TEXT = 'athena-vault-ok';
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(u8) { return btoa(String.fromCharCode(...u8)); }
export function b64ToBytes(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, plain, iv) {
  return b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)));
}
async function open(key, blob) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.data)));
}

export async function createVault(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const verifier = { iv: b64(iv), data: await seal(key, enc.encode(VERIFIER_TEXT), iv) };
  return { salt: b64(salt), iterations: ITERATIONS, verifier };
}

export async function unlock(password, meta) {
  try {
    const key = await deriveKey(password, b64ToBytes(meta.salt), meta.iterations || ITERATIONS);
    const plain = await open(key, meta.verifier);
    return dec.decode(plain) === VERIFIER_TEXT ? key : null;
  } catch (e) {
    return null;
  }
}

export async function encryptSecret(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: await seal(key, enc.encode(plaintext), iv) };
}

export async function decryptSecret(key, blob) {
  return dec.decode(await open(key, blob));
}
```

**Step 4:** Rodar `node --test test/vault.test.mjs` → **PASS** (Node 22 expõe `crypto` global; se o ambiente usar `--experimental-global-webcrypto`, ajustar o script `test`).

**Step 5:** Commit: `git commit -am "feat(vault): cofre AES-GCM com senha-mestre e testes"`

---

## Task 4: background — estado do cofre e mensagens de vault

**Files:**
- Modify: `extension/background.js`

**Step 1:** Adicionar no topo do `background.js`:
```js
import { createVault, unlock, encryptSecret, decryptSecret } from './vault.js';
```
> MV3 service workers suportam `import` de módulos locais (declarar `"type": "module"`? **não** — usar `importScripts` ou manter ESM: background vira `"background": { "service_worker": "background.js", "type": "module" }` no manifest). Atualizar o manifest na Task 9.

**Step 2:** Estado em memória + helpers:
```js
let vaultKey = null; // CryptoKey em memória; null = locked

async function vaultStatus() {
  const meta = (await chrome.storage.local.get('athena.vault'))['athena.vault'] || null;
  return { exists: !!meta, locked: !vaultKey };
}
```

**Step 3:** Rotas de mensagem (estender o listener existente):
```js
if (msg.type === 'athena_vault_status') { vaultStatus().then(sendResponse); return true; }
if (msg.type === 'athena_vault_create') {
  const meta = await createVault(msg.password);
  vaultKey = await unlock(msg.password, meta);
  await chrome.storage.local.set({ 'athena.vault': meta });
  sendResponse({ ok: true, locked: false });
  return true;
}
if (msg.type === 'athena_vault_unlock') {
  const meta = (await chrome.storage.local.get('athena.vault'))['athena.vault'];
  vaultKey = meta ? await unlock(msg.password, meta) : null;
  sendResponse({ ok: !!vaultKey, locked: !vaultKey });
  return true;
}
if (msg.type === 'athena_vault_lock') { vaultKey = null; sendResponse({ ok: true }); return true; }
```

**Step 4:** Auto-lock no início: no fim de `background.js`, `vaultKey = null;` (estado inicial já é null — documentar com comentário).

**Step 5:** Teste manual (checklist no fim do plano). Commit: `git commit -am "feat(background): estado do cofre e mensagens de vault"`

---

## Task 5: background — CRUD de credenciais (criptografado)

**Files:**
- Modify: `extension/background.js`

**Step 1:** Listar/salvar/excluir (exigem cofre desbloqueado):
```js
if (msg.type === 'athena_cred_list') {
  const creds = (await chrome.storage.local.get('athena.credentials'))['athena.credentials'] || [];
  sendResponse({ ok: true, creds: creds.map(({ secret, ...pub }) => pub) }); // sem o segredo
  return true;
}
if (msg.type === 'athena_cred_save') {
  if (!vaultKey) { sendResponse({ ok: false, error: 'vault_locked' }); return true; }
  const creds = (await chrome.storage.local.get('athena.credentials'))['athena.credentials'] || [];
  const secret = await encryptSecret(vaultKey, `${msg.username}\u0000${msg.password}`);
  const rec = { id: msg.id || 'c_' + Date.now().toString(36), name: msg.name, url: msg.url,
    userSelector: msg.userSelector, passSelector: msg.passSelector, submitSelector: msg.submitSelector, secret };
  const next = msg.id ? creds.map((c) => (c.id === msg.id ? rec : c)) : [...creds, rec];
  await chrome.storage.local.set({ 'athena.credentials': next });
  sendResponse({ ok: true, id: rec.id });
  return true;
}
if (msg.type === 'athena_cred_delete') {
  const creds = (await chrome.storage.local.get('athena.credentials'))['athena.credentials'] || [];
  await chrome.storage.local.set({ 'athena.credentials': creds.filter((c) => c.id !== msg.id) });
  sendResponse({ ok: true });
  return true;
}
```

**Step 2:** Resolver credencial para execução (usada pelo passo `login`):
```js
async function resolveCredential(profileId) {
  if (!vaultKey) throw new Error('vault_locked');
  const creds = (await chrome.storage.local.get('athena.credentials'))['athena.credentials'] || [];
  const c = creds.find((x) => x.id === profileId);
  if (!c) throw new Error('credencial não encontrada: ' + profileId);
  const plain = await decryptSecret(vaultKey, c.secret);
  const [username, password] = plain.split('\u0000');
  return { username, password, userSelector: c.userSelector, passSelector: c.passSelector, submitSelector: c.submitSelector };
}
```

**Step 3:** Novo comando `login` no `execute()`:
```js
case 'login': return loginStep(cmd);
// ...
async function loginStep(cmd) {
  const c = await resolveCredential(cmd.profileId);
  await execute({ type: 'fill', selector: c.userSelector, value: c.username });
  await execute({ type: 'fill', selector: c.passSelector, value: c.password });
  if (c.submitSelector) await execute({ type: 'click', selector: c.submitSelector });
  return { ok: true, loggedIn: true };
}
```

**Step 4:** Commit: `git commit -am "feat(background): CRUD de credenciais criptografadas + comando login"`

---

## Task 6: background — agendador (heartbeat via chrome.alarms)

**Files:**
- Modify: `extension/background.js`

**Step 1:** Heartbeat:
```js
import { nextRun } from './scheduler.js';

const SCHEDULE_ALARM = 'athena-scheduler';

async function schedulerTick() {
  const { ['athena.tasks']: tasks = [] } = await chrome.storage.local.get('athena.tasks');
  const now = Date.now();
  let changed = false;
  for (const task of tasks) {
    if (!task.enabled) continue;
    const next = nextRun(task, now);
    if (next !== null && next <= now) {
      changed = true;
      await executeTask(task);                       // Task 7
      task.lastRun = Date.now();
      task.nextRun = nextRun(task, Date.now());
      if (task.schedule.type === 'once') task.enabled = false;
      if (task.nextRun === null) task.enabled = false;
    } else if (task.nextRun !== next) {
      task.nextRun = next; changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ 'athena.tasks': tasks });
}
```
> `chrome.alarms` dispara no mínimo a cada 30s; o ticker apenas **confere** `nextRun <= now` — o agendamento é baseado em relógio, não em precisão de alarme.

**Step 2:** Criar alarme no startup e no `onInstalled`; handler:
```js
chrome.alarms.create(SCHEDULE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === SCHEDULE_ALARM) schedulerTick(); });
```
(Manter o alarme `athena-keepalive` existente intacto.)

**Step 3:** Guardar `task.nextRun` na criação/edição (na Task 8, UI chama `athena_task_save`; o background calcula `nextRun` e persiste).

**Step 4:** Commit: `git commit -am "feat(background): heartbeat do agendador via chrome.alarms"`

---

## Task 7: background — executor de tarefas (script e IA)

**Files:**
- Modify: `extension/background.js`

**Step 1:** `executeTask(task)`:
```js
async function executeTask(task) {
  const startedAt = Date.now();
  const entry = { taskId: task.id, name: task.name, startedAt, status: 'ok', summary: '' };
  try {
    let tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    const groupId = await groupTab(tab.id);
    if (task.mode === 'script') {
      const steps = task.steps || [];
      if (steps[0]?.type === 'navigate') {
        tab = await chrome.tabs.update(tab.id, { url: steps[0].url });
        steps.shift();
      }
      for (const step of steps) await execute({ ...step, tabId: tab.id });
      entry.summary = `${steps.length + (task.steps?.length - steps.length || 0)} passos executados`;
    } else {
      // modo IA: instrução + contexto + memórias
      const memory = await loadMemory(task.memoryIds || []);
      const prompt = buildAiPrompt(task, memory);
      const res = await runAiCommand(tab.id, prompt);
      entry.summary = res.ok ? (res.text || '').slice(0, 200) : 'falhou';
      if (!res.ok) throw new Error(res.error || 'erro na execução da IA');
    }
    if (task.closeTab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
  } catch (e) {
    entry.status = e.message === 'vault_locked' ? 'skipped' : 'error';
    entry.reason = e.message === 'vault_locked' ? 'vault_locked' : undefined;
    entry.error = String((e && e.message) || e);
  }
  entry.finishedAt = Date.now();
  await pushHistory(entry);
  notifyTaskResult(entry); // Task 10 (notifications)
}

function buildAiPrompt(task, memory) {
  const parts = [`Tarefa agendada: ${task.name}`, `Instrução: ${task.instruction}`];
  if (task.context) parts.push(`Contexto: ${task.context}`);
  if (memory.length) parts.push(`Memória:\n${memory.map((m) => `- ${m.text}`).join('\n')}`);
  parts.push('Execute os passos necessários e resuma o resultado.');
  return parts.join('\n');
}

async function loadMemory(ids) {
  const { ['athena.memory']: mem = [] } = await chrome.storage.local.get('athena.memory');
  return mem.filter((m) => ids.includes(m.id));
}

async function pushHistory(entry) {
  const { ['athena.taskHistory']: hist = [] } = await chrome.storage.local.get('athena.taskHistory');
  const next = [entry, ...hist].slice(0, 200);
  await chrome.storage.local.set({ 'athena.taskHistory': next });
}
```
> `runAiCommand(tabId, prompt)` já existe — o executor de IA reaproveita o loop de function calling.

**Step 2:** Mensagens de tarefas (CRUD) no listener:
```js
if (msg.type === 'athena_task_save') {
  const tasks = (await chrome.storage.local.get('athena.tasks'))['athena.tasks'] || [];
  const rec = { ...msg.task, updatedAt: Date.now(), nextRun: msg.task.enabled ? nextRun(msg.task, Date.now()) : null };
  const next = msg.task.id ? tasks.map((t) => (t.id === msg.task.id ? rec : t)) : [...tasks, rec];
  await chrome.storage.local.set({ 'athena.tasks': next });
  sendResponse({ ok: true, nextRun: rec.nextRun });
  return true;
}
if (msg.type === 'athena_task_delete') {
  const tasks = (await chrome.storage.local.get('athena.tasks'))['athena.tasks'] || [];
  await chrome.storage.local.set({ 'athena.tasks': tasks.filter((t) => t.id !== msg.id) });
  sendResponse({ ok: true }); return true;
}
if (msg.type === 'athena_task_run_now') {
  const tasks = (await chrome.storage.local.get('athena.tasks'))['athena.tasks'] || [];
  const task = tasks.find((t) => t.id === msg.id);
  if (!task) { sendResponse({ ok: false, error: 'tarefa não encontrada' }); return true; }
  executeTask(task).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
}
if (msg.type === 'athena_task_list' || msg.type === 'athena_task_history') {
  const key = msg.type === 'athena_task_history' ? 'athena.taskHistory' : 'athena.tasks';
  const { [key]: data = [] } = await chrome.storage.local.get(key);
  sendResponse({ ok: true, data }); return true;
}
```

**Step 3:** Commit: `git commit -am "feat(background): executor de tarefas (script/IA) + CRUD + histórico"`

---

## Task 8: UI — `schedule.html` + `schedule.js` (tarefas)

**Files:**
- Create: `extension/schedule.html`
- Create: `extension/schedule.js`

**Step 1:** `schedule.html`: tema igual ao `options.html` (dark, gradiente). Layout com 3 abas (tabs) simples:
- **Tarefas** — lista (nome, resumo de recorrência, próximo run, status, ações: ▶ executar agora, ✏️ editar, 🗑️ excluir, toggle habilitar) + botão **+ Nova tarefa**.
- **Credenciais** — status do cofre (🔒 bloqueado / 🔓 desbloqueado), botões **Definir senha-mestre / Desbloquear / Bloquear**; CRUD de perfis (nome, URL, seletores, usuário, senha).
- **Memória** — CRUD de notas (chave, texto, tags).

**Step 2:** `schedule.js`: helpers de mensagem:
```js
function send(msg) { return chrome.runtime.sendMessage(msg); }
```
Formulário da tarefa (campos):
- Nome, modo (`script`/`ai`), instrução (ai), contexto, memórias anexadas (checkbox da lista de memória),
- steps (script): linhas editáveis `{tipo, valor1, valor2}` com select de tipo (navigate/fill/click/screenshot/login) e, para `login`, select de perfil de credencial,
- agendamento: tipo (once/daily/weekly/monthly), data, hora, dias da semana (weekly), dia do mês (monthly), data fim, timezone (default `Intl.DateTimeFormat().resolvedOptions().timeZone`),
- `closeTab` checkbox, `enabled` checkbox.

**Step 3:** Renderização de lista com `scheduleSummary` (importar de `scheduler.js` via `<script type="module" src="schedule.js">` + import de `./scheduler.js`).

**Step 4:** **Teste manual** (checklist no fim). Commit: `git commit -am "feat(schedule): UI de tarefas agendadas"`

---

## Task 9: manifest + popup + content

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/popup.html`, `extension/popup.js`
- Modify: `extension/content.js`

**Step 1:** `manifest.json`:
- `"background": { "service_worker": "background.js", "type": "module" }` (necessário para `import` de `scheduler.js`/`vault.js`),
- adicionar `"notifications"` em `permissions`,
- subir versão para `1.3.0`.

**Step 2:** `popup.html`/`popup.js`: botão **⏰ Agendamentos** (abre `chrome.tabs.create({ url: chrome.runtime.getURL('schedule.html') })`) e linha de status do cofre (`🔒/🔓` via `athena_vault_status`).

**Step 3:** `content.js`: adicionar `login: 'fazendo login no site'` ao `LABELS` (toast). Sem outra mudança.

**Step 4:** Rodar `node --check` em todos os JS; validar `manifest.json` com JSON.parse. Commit: `git commit -am "feat: agendamentos no popup, manifest module + notifications, label de login"`

---

## Task 10: notificações de resultado

**Files:**
- Modify: `extension/background.js`

**Step 1:** `notifyTaskResult(entry)`:
```js
function notifyTaskResult(entry) {
  if (!chrome.notifications) return;
  const title = entry.status === 'ok' ? '✅ Tarefa concluída' : entry.status === 'skipped' ? '⏭️ Tarefa ignorada' : '❌ Tarefa falhou';
  const message = entry.status === 'skipped'
    ? `${entry.name} — cofre bloqueado. Desbloqueie para executar.`
    : `${entry.name} — ${entry.summary || entry.error || ''}`.slice(0, 180);
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message }).catch(() => {});
}
```

**Step 2:** Commit: `git commit -am "feat(notifications): avisos de resultado de tarefas"`

---

## Task 11: documentação e empacotamento

**Files:**
- Modify: `README.md`
- Modify: `CHROME-WEB-STORE.md`
- Modify: `POLITICA-DE-PRIVACIDADE.md`

**Step 1:** README: nova seção **⏰ Agendamento de tarefas** (modelo de dados resumido, cofre/senha-mestre, limitação "requer Chrome aberto", como criar uma tarefa) + atualizar a seção de segurança com o vault.

**Step 2:** CHROME-WEB-STORE.md: atualizar descrição longa (agendamento) e justificativa da permissão `notifications`; política: novo parágrafo sobre credenciais criptografadas localmente.

**Step 3:** Gerar zip: `powershell -ExecutionPolicy Bypass -File scripts/empacotar-extension.ps1` (versão 1.3.0). Commit: `git commit -am "docs: agendamento de tarefas no README, loja e politica"`

---

## Checklist de teste manual (executar no Chrome, extensão recarregada)

1. **Vault:** definir senha-mestre → status `🔓`; recarregar extensão (`chrome://extensions` Ctrl+R) → status volta a `🔒` (auto-lock). Desbloquear com senha errada → permanece bloqueado.
2. **Credencial:** criar perfil com seletores reais de um site de teste; editar e excluir; **abrir o DevTools → Application → Storage → chrome.storage.local** e conferir que `athena.credentials` contém apenas `secret.iv/data` (sem texto plano).
3. **Tarefa script:** criar tarefa `once` em `now + 1 min` com `navigate` + `login` + `click`; aguardar; conferir aba aberta no grupo Athena, histórico `ok` e notificação.
4. **Vault bloqueado + tarefa com login:** bloquear cofre, rodar tarefa → histórico `skipped` com `reason: vault_locked`, sem erro exposto.
5. **Tarefa IA:** com chave de API configurada, tarefa `daily` com instrução simples; conferir prompt montado (contexto + memória) e resumo no histórico.
6. **Recorrência:** criar `weekly` sex 09:00 e conferir `nextRun` exibido; editar para `daily` e conferir novo `nextRun`.
7. **Run now:** botão ▶ executa imediatamente e registra histórico.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `chrome.alarms` mínimo 30s | Agendamento por relógio (`nextRun`), alarme só confere; precisão suficiente para uso real |
| Tarefa roda sem Chrome aberto? Não roda | Documentado no README; notificação + histórico deixam claro |
| Chave do cofre perdida ao reiniciar SW | Auto-lock é o comportamento desejado; UX pede desbloqueio (botão no popup/agendamentos) |
| Esquecer senha-mestre | Sem recuperação (por design): opção **Resetar cofre** remove `athena.vault` + `athena.credentials` (exige confirmação) — adicionar na Task 8/9 se aprovado |
| Execução de IA + login no mesmo fluxo | Proibido por design: `login` só existe no modo `script`; validação na UI impede `login` em modo `ai` |
