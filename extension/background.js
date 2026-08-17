// ====================================================================
// Athena Chrome Bridge — background service worker (MV3)
// Conecta ao servidor ponte (ws://localhost:9222) e roteia comandos.
// - Badge no ícone: verde = conectado | roxo = executando
// - Direciona comandos para a última aba/janela focada (determinístico)
// - Linha de comando da IA: recebe prompts do botão flutuante, decide as
//   ações com a API (DeepSeek/OpenAI-compatible) e executa no navegador.
// - Agendador de tarefas + cofre de credenciais (vault).
// ====================================================================
import { createVault, unlock, encryptSecret, decryptSecret } from './vault.js';
import { nextRun } from './scheduler.js';

const WS_URL = 'ws://localhost:9222';
const GROUP_TITLE = '🦉 Athena';
const GROUP_COLOR = 'purple';
const TAB_GROUP_ID_NONE = (chrome.tabGroups && chrome.tabGroups.TAB_GROUP_ID_NONE) || -1;
let ws = null;
let reconnectTimer = null;
let lastTabId = null;

function connect() {
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[bridge] conectado ao servidor ponte');
    chrome.storage.local.set({ status: 'connected', url: WS_URL });
    setBadge('ON', '#34d399');
    try { chrome.alarms.create('athena-keepalive', { periodInMinutes: 0.5 }); } catch (e) {}
  };

  ws.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'ping') { send({ type: 'pong', id: msg.id }); return; }
    setBadge('…', '#6d5df6');
    await handleCommand(msg);
    setBadge('ON', '#34d399');
  };

  ws.onclose = () => {
    console.log('[bridge] desconectado');
    chrome.storage.local.set({ status: 'disconnected' });
    setBadge('', null);
    scheduleReconnect();
  };

  ws.onerror = () => {};
}

function setBadge(text, color) {
  try { chrome.action.setBadgeText({ text: text || '' }); } catch (e) {}
  if (color) { try { chrome.action.setBadgeBackgroundColor({ color }); } catch (e) {} }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

async function handleCommand(msg) {
  try {
    const result = await execute(msg);
    send({ type: 'result', id: msg.id, ok: true, result });
  } catch (e) {
    send({ type: 'result', id: msg.id, ok: false, error: String((e && e.message) || e) });
  }
}

async function execute(cmd) {
  switch (cmd.type) {
    case 'list_tabs':    return listTabs();
    case 'navigate':     return navigate(cmd);
    case 'open_tab':     return openTab(cmd);
    case 'activate_tab': return activateTab(cmd);
    case 'screenshot':   return screenshot(cmd);
    case 'login':        return loginStep(cmd);
    default: {
      const tab = await getTargetTab(cmd);
      return sendToContent(tab, cmd);
    }
  }
}

// Determina a aba alvo: tabId explícito > última aba focada > janela focada
async function getTargetTab(cmd) {
  if (cmd.tabId) return chrome.tabs.get(cmd.tabId);
  if (lastTabId) {
    try { return await chrome.tabs.get(lastTabId); } catch (e) { /* segue */ }
  }
  const win = await chrome.windows.getLastFocused({ populate: true });
  const active = (win.tabs || []).find((t) => t.active) || (win.tabs || [])[0];
  if (active) return active;
  throw new Error('Nenhuma aba encontrada');
}

function listTabs() {
  return chrome.tabs.query({}).then((tabs) =>
    tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.active, windowId: t.windowId })),
  );
}

async function navigate(cmd) {
  const tab = await getTargetTab(cmd);
  const t = await chrome.tabs.update(tab.id, { url: cmd.url });
  await groupTab(t.id);
  return { ok: true, tabId: t.id, url: t.url, groupId: t.groupId || null };
}

// Abre uma nova aba e a adiciona ao grupo "Athena"
async function openTab(cmd) {
  const tab = await chrome.tabs.create({ url: cmd.url || 'about:blank', active: true });
  const groupId = await groupTab(tab.id);
  return { ok: true, tabId: tab.id, url: tab.url, groupId };
}

// Garante que a aba esteja dentro do grupo visual "🦉 Athena"
async function groupTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId && tab.groupId !== TAB_GROUP_ID_NONE) return tab.groupId;
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title: GROUP_TITLE, color: GROUP_COLOR });
    return groupId;
  } catch (e) {
    return null;
  }
}

function activateTab(cmd) {
  return chrome.tabs
    .update(cmd.tabId, { active: true })
    .then((t) => ({ ok: true, tabId: t.id }));
}

function screenshot(cmd) {
  return getTargetTab(cmd)
    .then((tab) => chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }))
    .then((dataUrl) => ({ dataUrl }));
}

// ====================================================================
// Credenciais — passo de login (determinístico, nunca exposto à IA)
// ====================================================================
async function resolveCredential(profileId) {
  if (!vaultKey) throw new Error('vault_locked');
  const data = await chrome.storage.local.get('athena.credentials');
  const creds = data['athena.credentials'] || [];
  const c = creds.find((x) => x.id === profileId);
  if (!c) throw new Error('credencial não encontrada: ' + profileId);
  const plain = await decryptSecret(vaultKey, c.secret);
  const [username, password] = plain.split('\u0000');
  return {
    username, password,
    userSelector: c.userSelector, passSelector: c.passSelector, submitSelector: c.submitSelector,
  };
}

async function loginStep(cmd) {
  const c = await resolveCredential(cmd.profileId);
  await execute({ type: 'fill', selector: c.userSelector, value: c.username, tabId: cmd.tabId });
  await execute({ type: 'fill', selector: c.passSelector, value: c.password, tabId: cmd.tabId });
  if (c.submitSelector) await execute({ type: 'click', selector: c.submitSelector, tabId: cmd.tabId });
  return { ok: true, loggedIn: true };
}

async function sendToContent(tab, cmd) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) { /* já injetado ou página restrita */ }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: cmd.type, selector: cmd.selector, value: cmd.value, script: cmd.script },
      (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(resp);
      },
    );
  });
}

// Acompanha a última aba/janela focada pelo usuário
chrome.tabs.onActivated.addListener((info) => {
  lastTabId = info.tabId;
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs[0]) lastTabId = tabs[0].id;
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'athena-keepalive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) connect();
    else send({ type: 'ping' });
  } else if (alarm.name === SCHEDULE_ALARM) {
    schedulerTick();
  }
});

// ====================================================================
// IA — linha de comando (botão flutuante)
// Usa a chave de API salva nas Configurações da extensão.
// ====================================================================
const AI_DEFAULT_URL = 'https://api.deepseek.com/chat/completions';
const AI_DEFAULT_MODEL = 'deepseek-chat';
const AI_MAX_STEPS = 10;

const AI_SYSTEM_PROMPT =
  'Você é a Athena, um agente de IA que controla o navegador Chrome do usuário. ' +
  'O usuário digita comandos em linguagem natural e você decide quais ferramentas usar ' +
  '(navegar, abrir abas, ler páginas, buscar/clicar/preencher elementos, executar JS, screenshot etc.). ' +
  'Responda em português brasileiro, de forma objetiva. ' +
  'Ao concluir a tarefa, resuma o que fez e o resultado obtido.';

const AI_TOOLS = [
  { type: 'function', function: { name: 'navigate', description: 'Navega a aba ativa para uma URL (e a agrupa)', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL completa' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'open_tab', description: 'Abre uma nova aba no grupo Athena e navega para uma URL', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL completa' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'read_page', description: 'Lê título, URL e texto da página ativa', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_page_text', description: 'Texto bruto da página ativa', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'find', description: 'Busca elementos por seletor CSS', parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } } },
  { type: 'function', function: { name: 'click', description: 'Clica num elemento', parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } } },
  { type: 'function', function: { name: 'fill', description: 'Preenche um campo', parameters: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } } },
  { type: 'function', function: { name: 'evaluate', description: 'Executa JavaScript na página', parameters: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } } },
  { type: 'function', function: { name: 'screenshot', description: 'Screenshot da aba ativa', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_tabs', description: 'Lista as abas abertas', parameters: { type: 'object', properties: {} } } },
];

const AI_CMD_MAP = {
  navigate: (a) => ({ type: 'navigate', url: a.url }),
  open_tab: (a) => ({ type: 'open_tab', url: a.url }),
  read_page: () => ({ type: 'read_page' }),
  get_page_text: () => ({ type: 'get_page_text' }),
  find: (a) => ({ type: 'find', selector: a.selector }),
  click: (a) => ({ type: 'click', selector: a.selector }),
  fill: (a) => ({ type: 'fill', selector: a.selector, value: a.value }),
  evaluate: (a) => ({ type: 'evaluate', script: a.script }),
  screenshot: () => ({ type: 'screenshot' }),
  list_tabs: () => ({ type: 'list_tabs' }),
};

async function getAiConfig() {
  const data = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
  return {
    apiKey: (data.apiKey || '').trim(),
    apiUrl: (data.apiUrl || AI_DEFAULT_URL).trim(),
    model: (data.model || AI_DEFAULT_MODEL).trim(),
  };
}

function notifyTab(tabId, msg) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

async function aiChat(cfg, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('IA HTTP ' + res.status + (t ? ' — ' + t.slice(0, 300) : ''));
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function execAiTool(name, args) {
  const maker = AI_CMD_MAP[name];
  if (!maker) return { ok: false, error: 'Ferramenta desconhecida: ' + name };
  try {
    const result = await execute(maker(args || {}));
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// Loop da IA: chama a API, executa as ferramentas pedidas e devolve a resposta final
async function runAiCommand(tabId, prompt) {
  const cfg = await getAiConfig();
  if (!cfg.apiKey) return { ok: false, error: 'sem_api_key' };

  const messages = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  for (let i = 0; i < AI_MAX_STEPS; i++) {
    const data = await aiChat(cfg, { model: cfg.model, messages, tools: AI_TOOLS, temperature: 0.2 });
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('Resposta inesperada da IA');

    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { /* args vazios */ }
        const label = '🔧 ' + tc.function.name + (tc.function.arguments ? ' ' + tc.function.arguments.slice(0, 200) : '');
        notifyTab(tabId, { type: 'athena_progress', text: label });
        const result = await execAiTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
      }
      continue;
    }

    const text = (msg.content || '').trim();
    if (text) notifyTab(tabId, { type: 'athena_response', text });
    return { ok: true, text };
  }
  throw new Error('Limite de passos da IA atingido');
}

// ====================================================================
// Cofre de credenciais (vault) — chave apenas em memória
// ====================================================================
let vaultKey = null; // CryptoKey em memória; null = bloqueado (auto-lock ao reiniciar)

async function vaultStatus() {
  const data = await chrome.storage.local.get('athena.vault');
  const meta = data['athena.vault'] || null;
  return { exists: !!meta, locked: !vaultKey };
}

// ====================================================================
// Agendador de tarefas (heartbeat via chrome.alarms, mín. 30s)
// ====================================================================
const SCHEDULE_ALARM = 'athena-scheduler';

async function schedulerTick() {
  const data = await chrome.storage.local.get('athena.tasks');
  const tasks = data['athena.tasks'] || [];
  const now = Date.now();
  let changed = false;
  for (const task of tasks) {
    if (!task.enabled) continue;
    const next = nextRun(task, now);
    if (next !== null && next <= now) {
      changed = true;
      await executeTask(task); // definido na seção do executor (Task 7)
      task.lastRun = Date.now();
      task.nextRun = nextRun(task, Date.now());
      if (task.schedule.type === 'once' || task.nextRun === null) task.enabled = false;
    } else if (task.nextRun !== next) {
      task.nextRun = next;
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ 'athena.tasks': tasks });
}

// ====================================================================
// Executor de tarefas (modo script determinístico | modo ai com contexto)
// ====================================================================
async function executeTask(task) {
  const startedAt = Date.now();
  const entry = { taskId: task.id, name: task.name, startedAt, status: 'ok', summary: '' };
  try {
    let tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    await groupTab(tab.id);
    if (task.mode === 'script') {
      const steps = [...(task.steps || [])];
      if (steps[0]?.type === 'navigate') {
        tab = await chrome.tabs.update(tab.id, { url: steps[0].url });
        steps.shift();
      }
      for (const step of steps) await execute({ ...step, tabId: tab.id });
      entry.summary = `${steps.length} passos executados`;
    } else {
      const memory = await loadMemory(task.memoryIds || []);
      const prompt = buildAiPrompt(task, memory);
      const res = await runAiCommand(tab.id, prompt);
      entry.summary = res.ok ? (res.text || '').slice(0, 200) : 'falhou';
      if (!res.ok) throw new Error(res.error || 'erro na execução da IA');
    }
    if (task.closeTab) { try { await chrome.tabs.remove(tab.id); } catch (e) { /* segue */ } }
  } catch (e) {
    const reason = String((e && e.message) || e);
    entry.status = reason === 'vault_locked' ? 'skipped' : 'error';
    if (reason === 'vault_locked') entry.reason = 'vault_locked';
    entry.error = reason;
  }
  entry.finishedAt = Date.now();
  await pushHistory(entry);
  notifyTaskResult(entry);
  return entry;
}

function buildAiPrompt(task, memory) {
  const parts = [`Tarefa agendada: ${task.name}`, `Instrução: ${task.instruction}`];
  if (task.context) parts.push(`Contexto: ${task.context}`);
  if (memory.length) parts.push(`Memória:\n${memory.map((m) => `- ${m.text}`).join('\n')}`);
  parts.push('Execute os passos necessários e resuma o resultado.');
  return parts.join('\n');
}

async function loadMemory(ids) {
  const data = await chrome.storage.local.get('athena.memory');
  const mem = data['athena.memory'] || [];
  return mem.filter((m) => ids.includes(m.id));
}

async function pushHistory(entry) {
  const data = await chrome.storage.local.get('athena.taskHistory');
  const hist = data['athena.taskHistory'] || [];
  await chrome.storage.local.set({ 'athena.taskHistory': [entry, ...hist].slice(0, 200) });
}

function notifyTaskResult(entry) {
  if (!chrome.notifications) return;
  const title = entry.status === 'ok' ? '✅ Tarefa concluída' : entry.status === 'skipped' ? '⏭️ Tarefa ignorada' : '❌ Tarefa falhou';
  const message = entry.status === 'skipped'
    ? `${entry.name} — cofre bloqueado. Desbloqueie para executar.`
    : `${entry.name} — ${entry.summary || entry.error || ''}`.slice(0, 180);
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message }).catch(() => {});
}

// Mensagens do popup e do content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'reconnect') {
    connect();
    if (sendResponse) sendResponse({ ok: true });
    return false;
  }

  // ---- cofre ----
  if (msg.type === 'athena_vault_status') {
    vaultStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'athena_vault_create') {
    createVault(String(msg.password || ''))
      .then(async (meta) => {
        vaultKey = await unlock(String(msg.password || ''), meta);
        await chrome.storage.local.set({ 'athena.vault': meta });
        sendResponse({ ok: true, locked: !vaultKey });
      })
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_vault_unlock') {
    chrome.storage.local
      .get('athena.vault')
      .then(async (data) => {
        const meta = data['athena.vault'];
        vaultKey = meta ? await unlock(String(msg.password || ''), meta) : null;
        sendResponse({ ok: !!vaultKey, locked: !vaultKey });
      })
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_vault_lock') {
    vaultKey = null;
    sendResponse({ ok: true, locked: true });
    return false;
  }

  // ---- credenciais (exigem cofre desbloqueado) ----
  if (msg.type === 'athena_cred_list') {
    chrome.storage.local
      .get('athena.credentials')
      .then((data) => {
        const creds = data['athena.credentials'] || [];
        // nunca expõe o segredo (cifrado ou não) à UI além do necessário
        sendResponse({ ok: true, creds: creds.map(({ secret, ...pub }) => pub) });
      })
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_cred_save') {
    (async () => {
      if (!vaultKey) return { ok: false, error: 'vault_locked' };
      const data = await chrome.storage.local.get('athena.credentials');
      const creds = data['athena.credentials'] || [];
      const secret = await encryptSecret(vaultKey, `${msg.username || ''}\u0000${msg.password || ''}`);
      const rec = {
        id: msg.id || 'c_' + Date.now().toString(36),
        name: String(msg.name || '').trim(),
        url: String(msg.url || '').trim(),
        userSelector: String(msg.userSelector || '').trim(),
        passSelector: String(msg.passSelector || '').trim(),
        submitSelector: String(msg.submitSelector || '').trim(),
        secret,
      };
      if (!rec.name || !rec.url || !rec.userSelector || !rec.passSelector) {
        return { ok: false, error: 'campos obrigatórios: nome, URL, seletores de usuário e senha' };
      }
      const next = msg.id ? creds.map((c) => (c.id === msg.id ? rec : c)) : [...creds, rec];
      await chrome.storage.local.set({ 'athena.credentials': next });
      return { ok: true, id: rec.id };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_cred_delete') {
    (async () => {
      const data = await chrome.storage.local.get('athena.credentials');
      const creds = data['athena.credentials'] || [];
      await chrome.storage.local.set({ 'athena.credentials': creds.filter((c) => c.id !== msg.id) });
      return { ok: true };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  // ---- tarefas agendadas ----
  if (msg.type === 'athena_task_list' || msg.type === 'athena_task_history') {
    const key = msg.type === 'athena_task_history' ? 'athena.taskHistory' : 'athena.tasks';
    chrome.storage.local
      .get(key)
      .then((data) => sendResponse({ ok: true, data: data[key] || [] }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_task_save') {
    (async () => {
      const data = await chrome.storage.local.get('athena.tasks');
      const tasks = data['athena.tasks'] || [];
      const rec = { ...msg.task, updatedAt: Date.now() };
      if (!rec.id) rec.id = 't_' + Date.now().toString(36);
      rec.nextRun = rec.enabled !== false ? nextRun(rec, Date.now()) : null;
      const next = rec.id && tasks.some((t) => t.id === rec.id)
        ? tasks.map((t) => (t.id === rec.id ? rec : t))
        : [...tasks, rec];
      await chrome.storage.local.set({ 'athena.tasks': next });
      return { ok: true, nextRun: rec.nextRun };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_task_delete') {
    (async () => {
      const data = await chrome.storage.local.get('athena.tasks');
      const tasks = data['athena.tasks'] || [];
      await chrome.storage.local.set({ 'athena.tasks': tasks.filter((t) => t.id !== msg.id) });
      return { ok: true };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_task_run_now') {
    (async () => {
      const data = await chrome.storage.local.get('athena.tasks');
      const tasks = data['athena.tasks'] || [];
      const task = tasks.find((t) => t.id === msg.id);
      if (!task) return { ok: false, error: 'tarefa não encontrada' };
      const entry = await executeTask(task);
      task.lastRun = Date.now();
      task.nextRun = nextRun(task, Date.now());
      await chrome.storage.local.set({ 'athena.tasks': tasks });
      return { ok: true, entry };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  // ---- memória ----
  if (msg.type === 'athena_memory_list') {
    chrome.storage.local
      .get('athena.memory')
      .then((data) => sendResponse({ ok: true, data: data['athena.memory'] || [] }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_memory_save') {
    (async () => {
      const data = await chrome.storage.local.get('athena.memory');
      const mem = data['athena.memory'] || [];
      const rec = { ...msg.item, updatedAt: Date.now() };
      if (!rec.id) rec.id = 'm_' + Date.now().toString(36);
      rec.tags = Array.isArray(rec.tags) ? rec.tags : String(rec.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!rec.key || !rec.text) return { ok: false, error: 'chave e texto são obrigatórios' };
      const next = rec.id && mem.some((m) => m.id === rec.id) ? mem.map((m) => (m.id === rec.id ? rec : m)) : [...mem, rec];
      await chrome.storage.local.set({ 'athena.memory': next });
      return { ok: true, id: rec.id };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'athena_memory_delete') {
    (async () => {
      const data = await chrome.storage.local.get('athena.memory');
      const mem = data['athena.memory'] || [];
      await chrome.storage.local.set({ 'athena.memory': mem.filter((m) => m.id !== msg.id) });
      return { ok: true };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === 'athena_command') {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    runAiCommand(tabId, String(msg.text || '').trim())
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === 'athena_get_config') {
    getAiConfig().then((cfg) =>
      sendResponse({ ok: true, hasKey: !!cfg.apiKey, apiUrl: cfg.apiUrl, model: cfg.model }),
    );
    return true;
  }

  return false;
});

// Atalho de teclado (Alt+Shift+A) — abre/fecha a linha de comando da IA
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-athena') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (e) {}
  try { await chrome.tabs.sendMessage(tab.id, { type: 'athena_toggle' }); } catch (e) {}
});

chrome.runtime.onInstalled.addListener(() => connect());
connect();
chrome.alarms.create(SCHEDULE_ALARM, { periodInMinutes: 0.5 });
