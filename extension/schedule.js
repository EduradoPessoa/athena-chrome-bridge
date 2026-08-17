// ====================================================================
// Athena Chrome Bridge — UI de Agendamentos (tarefas + cofre + memória)
// ====================================================================
import { scheduleSummary } from './scheduler.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function send(msg) { return chrome.runtime.sendMessage(msg); }

let state = { tasks: [], creds: [], memory: [], vault: { exists: false, locked: true }, history: [] };
let editingTaskId = null;
let editingCredId = null;
let editingMemoryId = null;

/* ---------------- tabs ---------------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
  });
});

// modo segundo plano (Camada 1 da limitação "requer Chrome aberto")
const openBgSettings = $('openBgSettings');
if (openBgSettings) {
  openBgSettings.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://settings/system' });
  });
}

/* ---------------- cofre ---------------- */
async function refreshVault() {
  const r = await send({ type: 'athena_vault_status' });
  if (!r || !r.ok) return;
  state.vault = r;
  const box = $('vaultBox');
  if (!r.exists) {
    box.innerHTML = `<b>🔒 Definir senha-mestre do cofre</b>
      <p class="hint">As credenciais de sites ficam criptografadas com AES-GCM. A chave fica só na memória e o cofre bloqueia ao reiniciar o Chrome. Não há recuperação — guarde bem esta senha.</p>
      <div class="row" style="margin-top:10px"><input id="vNewPass" type="password" placeholder="Senha-mestre" style="max-width:260px">
      <button class="btn" id="vCreate">Criar cofre</button></div>
      <p class="status" id="vStatus"></p>`;
    $('vCreate').addEventListener('click', async () => {
      const st = $('vStatus');
      const rr = await send({ type: 'athena_vault_create', password: $('vNewPass').value });
      st.textContent = rr?.ok ? '✅ Cofre criado e desbloqueado.' : '⚠️ ' + (rr?.error || 'erro');
      st.className = 'status ' + (rr?.ok ? 'ok' : 'err');
      refreshVault();
    });
  } else {
    box.innerHTML = r.locked
      ? `<b>🔒 Cofre bloqueado</b>
         <p class="hint">Desbloqueie para gerenciar credenciais. Tarefas com passo de login ficam "ignoradas" enquanto o cofre estiver bloqueado.</p>
         <div class="row" style="margin-top:10px"><input id="vPass" type="password" placeholder="Senha-mestre" style="max-width:260px">
         <button class="btn" id="vUnlock">Desbloquear</button></div>
         <p class="status" id="vStatus"></p>`
      : `<b>🔓 Cofre desbloqueado</b> <button class="btn ghost small" id="vLock" style="float:right">Bloquear</button>`;
    const unlockBtn = $('vUnlock');
    if (unlockBtn) unlockBtn.addEventListener('click', async () => {
      const st = $('vStatus');
      const rr = await send({ type: 'athena_vault_unlock', password: $('vPass').value });
      st.textContent = rr?.ok ? '✅ Desbloqueado.' : '⚠️ Senha incorreta.';
      st.className = 'status ' + (rr?.ok ? 'ok' : 'err');
      refreshVault();
    });
    const lockBtn = $('vLock');
    if (lockBtn) lockBtn.addEventListener('click', async () => { await send({ type: 'athena_vault_lock' }); refreshVault(); });
  }
}

/* ---------------- credenciais ---------------- */
async function refreshCreds() {
  const r = await send({ type: 'athena_cred_list' });
  if (!r || !r.ok) return;
  state.creds = r.creds;
  $('credCount').textContent = `${r.creds.length} credencial(is)`;
  $('credList').innerHTML = r.creds.length
    ? r.creds.map((c) => `
      <div class="item"><div class="item-head">
        <div><div class="item-title">${esc(c.name)}</div>
        <div class="item-sub">${esc(c.url)} · user: <code>${esc(c.userSelector)}</code> · pass: <code>${esc(c.passSelector)}</code>${c.submitSelector ? ' · submit: <code>' + esc(c.submitSelector) + '</code>' : ''}</div></div>
        <div class="item-actions"><button class="btn ghost small" data-edit="${c.id}">Editar</button>
        <button class="btn danger small" data-del="${c.id}">Excluir</button></div>
      </div></div>`).join('')
    : '<div class="empty">Nenhuma credencial. Desbloqueie o cofre e adicione a primeira.</div>';
  document.querySelectorAll('#credList [data-edit]').forEach((b) => b.addEventListener('click', () => openCredEditor(b.dataset.edit)));
  document.querySelectorAll('#credList [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (confirm('Excluir esta credencial?')) { await send({ type: 'athena_cred_delete', id: b.dataset.del }); refreshCreds(); }
  }));
}

function openCredEditor(id) {
  editingCredId = id || null;
  const c = id ? state.creds.find((x) => x.id === id) : null;
  $('credEditorTitle').textContent = id ? 'Editar credencial' : 'Nova credencial';
  $('cName').value = c?.name || ''; $('cUrl').value = c?.url || '';
  $('cUserSel').value = c?.userSelector || ''; $('cPassSel').value = c?.passSelector || '';
  $('cSubmitSel').value = c?.submitSelector || '';
  $('cUsername').value = ''; $('cPassword').value = '';
  $('cUsername').placeholder = id ? 'Digite novamente (ou deixe em branco p/ manter?)' : 'usuário';
  $('cPassword').placeholder = id ? 'Digite novamente' : 'senha';
  $('cStatus').textContent = '';
  $('credEditor').hidden = false;
}
$('newCred').addEventListener('click', () => openCredEditor(null));
$('cCancel').addEventListener('click', () => { $('credEditor').hidden = true; });
$('cSave').addEventListener('click', async () => {
  const st = $('cStatus');
  const rr = await send({
    type: 'athena_cred_save', id: editingCredId,
    name: $('cName').value, url: $('cUrl').value,
    userSelector: $('cUserSel').value, passSelector: $('cPassSel').value, submitSelector: $('cSubmitSel').value,
    username: $('cUsername').value, password: $('cPassword').value,
  });
  st.textContent = rr?.ok ? '✅ Salvo.' : '⚠️ ' + (rr?.error === 'vault_locked' ? 'Desbloqueie o cofre primeiro.' : (rr?.error || 'erro'));
  st.className = 'status ' + (rr?.ok ? 'ok' : 'err');
  if (rr?.ok) { $('credEditor').hidden = true; refreshCreds(); }
});

/* ---------------- memória ---------------- */
async function refreshMemory() {
  const r = await send({ type: 'athena_memory_list' });
  if (!r || !r.ok) return;
  state.memory = r.data;
  $('memoryCount').textContent = `${r.data.length} nota(s)`;
  $('memoryList').innerHTML = r.data.length
    ? r.data.map((m) => `
      <div class="item"><div class="item-head">
        <div><div class="item-title">${esc(m.key)}</div>
        <div class="item-sub">${esc(m.text)}</div>
        <div style="margin-top:6px">${(m.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</div></div>
        <div class="item-actions"><button class="btn ghost small" data-edit="${m.id}">Editar</button>
        <button class="btn danger small" data-del="${m.id}">Excluir</button></div>
      </div></div>`).join('')
    : '<div class="empty">Nenhuma nota de memória.</div>';
  document.querySelectorAll('#memoryList [data-edit]').forEach((b) => b.addEventListener('click', () => openMemoryEditor(b.dataset.edit)));
  document.querySelectorAll('#memoryList [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (confirm('Excluir esta nota?')) { await send({ type: 'athena_memory_delete', id: b.dataset.del }); refreshMemory(); refreshTaskForm(); }
  }));
}

function openMemoryEditor(id) {
  editingMemoryId = id || null;
  const m = id ? state.memory.find((x) => x.id === id) : null;
  $('memoryEditorTitle').textContent = id ? 'Editar nota' : 'Nova nota de memória';
  $('mKey').value = m?.key || ''; $('mText').value = m?.text || '';
  $('mTags').value = (m?.tags || []).join(', ');
  $('mStatus').textContent = '';
  $('memoryEditor').hidden = false;
}
$('newMemory').addEventListener('click', () => openMemoryEditor(null));
$('mCancel').addEventListener('click', () => { $('memoryEditor').hidden = true; });
$('mSave').addEventListener('click', async () => {
  const st = $('mStatus');
  const rr = await send({ type: 'athena_memory_save', item: { id: editingMemoryId, key: $('mKey').value, text: $('mText').value, tags: $('mTags').value } });
  st.textContent = rr?.ok ? '✅ Salvo.' : '⚠️ ' + (rr?.error || 'erro');
  st.className = 'status ' + (rr?.ok ? 'ok' : 'err');
  if (rr?.ok) { $('memoryEditor').hidden = true; refreshMemory(); refreshTaskForm(); }
});

/* ---------------- tarefas ---------------- */
const STEP_TYPES = {
  navigate: ['url'],
  fill: ['selector', 'value'],
  click: ['selector'],
  screenshot: [],
  login: ['profileId'],
};

function stepRowHtml(step = { type: 'navigate', url: '', selector: '', value: '', profileId: '' }, idx) {
  const sel = STEP_TYPES[step.type] || [];
  const val = (k) => esc(step[k] ?? '');
  let inputs = '';
  if (sel.includes('url')) inputs += `<input data-k="url" placeholder="https://…" value="${val('url')}">`;
  if (sel.includes('selector')) inputs += `<input data-k="selector" placeholder="seletor CSS" value="${val('selector')}">`;
  if (sel.includes('value')) inputs += `<input data-k="value" placeholder="valor" value="${val('value')}">`;
  if (sel.includes('profileId')) {
    inputs += `<select data-k="profileId"><option value="">— escolher credencial —</option>${state.creds
      .map((c) => `<option value="${esc(c.id)}" ${c.id === step.profileId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  }
  return `<div class="step-row" data-idx="${idx}">
    <select data-k="type">${Object.keys(STEP_TYPES).map((t) => `<option ${t === step.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${inputs}<button class="btn danger small" data-remove>✕</button></div>`;
}

function renderSteps() {
  const wrap = $('tSteps');
  const steps = JSON.parse(sessionStorage.getItem('athena.steps') || '[]');
  wrap.innerHTML = steps.map((s, i) => stepRowHtml(s, i)).join('');
  wrap.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    const idx = +b.closest('.step-row').dataset.idx;
    const arr = JSON.parse(sessionStorage.getItem('athena.steps') || '[]');
    arr.splice(idx, 1); sessionStorage.setItem('athena.steps', JSON.stringify(arr)); renderSteps();
  }));
  wrap.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
    const idx = +el.closest('.step-row').dataset.idx;
    const arr = JSON.parse(sessionStorage.getItem('athena.steps') || '[]');
    const k = el.dataset.k;
    if (k === 'type') { arr[idx] = { type: el.value }; }
    else arr[idx][k] = el.value;
    sessionStorage.setItem('athena.steps', JSON.stringify(arr));
    if (k === 'type') renderSteps();
  }));
}
$('addStep').addEventListener('click', () => {
  const arr = JSON.parse(sessionStorage.getItem('athena.steps') || '[]');
  arr.push({ type: 'navigate', url: '' });
  sessionStorage.setItem('athena.steps', JSON.stringify(arr)); renderSteps();
});

function refreshTaskForm() {
  $('tMemoryPick').innerHTML = state.memory.length
    ? state.memory.map((m) => `<label class="switch"><input type="checkbox" value="${m.id}" data-mid="${m.id}"> ${esc(m.key)}</label>`).join('')
    : '<span class="muted">Sem memórias — crie na aba 🧠 Memória.</span>';
}

function syncScheduleFields() {
  const type = $('tType').value;
  $('tDateWrap').hidden = false;
  $('tWeekdaysWrap').hidden = type !== 'weekly';
  $('tDomWrap').hidden = type !== 'monthly';
  if (type === 'daily') $('tDateWrap').hidden = true;
}

function openTaskEditor(task) {
  editingTaskId = task?.id || null;
  $('taskEditorTitle').textContent = task ? 'Editar tarefa' : 'Nova tarefa';
  $('tName').value = task?.name || '';
  $('tMode').value = task?.mode || 'script';
  $('tInstruction').value = task?.instruction || '';
  $('tContext').value = task?.context || '';
  $('tCloseTab').checked = task ? !!task.closeTab : true;
  $('tEnabled').checked = task ? task.enabled !== false : true;
  $('tType').value = task?.schedule?.type || 'once';
  $('tDate').value = task?.schedule?.date || new Date().toISOString().slice(0, 10);
  $('tTime').value = task?.schedule?.time || '09:00';
  $('tEnd').value = task?.schedule?.endDate || '';
  $('tTz').value = task?.schedule?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('tDom').value = task?.schedule?.dayOfMonth ?? 15;
  document.querySelectorAll('[data-wd]').forEach((cb) => { cb.checked = (task?.schedule?.weekdays || []).includes(+cb.dataset.wd); });
  sessionStorage.setItem('athena.steps', JSON.stringify(task?.steps || []));
  renderSteps(); refreshTaskForm(); syncScheduleFields();
  toggleModeFields();
  $('tStatus').textContent = '';
  $('taskEditor').hidden = false;
  $('taskEditor').scrollIntoView({ behavior: 'smooth' });
}

function toggleModeFields() {
  const ai = $('tMode').value === 'ai';
  $('tAiFields').hidden = !ai;
  $('tStepsFields').hidden = ai;
}

$('newTask').addEventListener('click', () => openTaskEditor(null));
$('tCancel').addEventListener('click', () => { $('taskEditor').hidden = true; });
$('tMode').addEventListener('change', toggleModeFields);
$('tType').addEventListener('change', syncScheduleFields);

$('tSave').addEventListener('click', async () => {
  const st = $('tStatus');
  const weekdays = [...document.querySelectorAll('[data-wd]:checked')].map((cb) => +cb.dataset.wd);
  const memoryIds = [...document.querySelectorAll('#tMemoryPick input:checked')].map((cb) => cb.value);
  const steps = JSON.parse(sessionStorage.getItem('athena.steps') || '[]');
  const task = {
    id: editingTaskId,
    name: $('tName').value.trim(),
    enabled: $('tEnabled').checked,
    closeTab: $('tCloseTab').checked,
    mode: $('tMode').value,
    instruction: $('tInstruction').value.trim(),
    context: $('tContext').value.trim(),
    memoryIds,
    steps,
    schedule: {
      type: $('tType').value,
      date: $('tDate').value,
      time: $('tTime').value || '09:00',
      weekdays: $('tType').value === 'weekly' ? weekdays : undefined,
      dayOfMonth: $('tType').value === 'monthly' ? +$('tDom').value : undefined,
      endDate: $('tEnd').value || null,
      tz: $('tTz').value.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
  const rr = await send({ type: 'athena_task_save', task });
  st.textContent = rr?.ok
    ? `✅ Salvo. Próxima execução: ${rr.nextRun ? new Date(rr.nextRun).toLocaleString('pt-BR') : '— (desabilitada ou sem próxima data)'}`
    : '⚠️ ' + (rr?.error || 'erro');
  st.className = 'status ' + (rr?.ok ? 'ok' : 'err');
  if (rr?.ok) { $('taskEditor').hidden = true; refreshTasks(); }
});

async function refreshTasks() {
  const r = await send({ type: 'athena_task_list' });
  if (!r || !r.ok) return;
  state.tasks = r.data;
  $('taskCount').textContent = `${r.data.length} tarefa(s)`;
  $('taskList').innerHTML = r.data.length
    ? r.data.map((t) => {
      const status = !t.enabled ? 'warn' : (t.nextRun ? 'ok' : 'warn');
      const label = !t.enabled ? 'desabilitada' : (t.nextRun ? new Date(t.nextRun).toLocaleString('pt-BR') : 'sem próxima execução');
      return `<div class="item"><div class="item-head">
        <div><div class="item-title">${esc(t.name)} <span class="chip">${esc(t.mode)}</span></div>
        <div class="item-sub">${esc(scheduleSummary(t.schedule))} · próximo: <span class="chip ${status}">${esc(label)}</span></div></div>
        <div class="item-actions">
          <button class="btn ghost small" data-run="${t.id}">▶ Executar agora</button>
          <button class="btn ghost small" data-edit="${t.id}">Editar</button>
          <button class="btn danger small" data-del="${t.id}">Excluir</button>
        </div>
      </div></div>`;
    }).join('')
    : '<div class="empty">Nenhuma tarefa agendada. Clique em "+ Nova tarefa".</div>';
  document.querySelectorAll('#taskList [data-run]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Executando…';
    await send({ type: 'athena_task_run_now', id: b.dataset.run });
    refreshTasks(); refreshHistory();
  }));
  document.querySelectorAll('#taskList [data-edit]').forEach((b) => b.addEventListener('click', () => openTaskEditor(state.tasks.find((t) => t.id === b.dataset.edit))));
  document.querySelectorAll('#taskList [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (confirm('Excluir esta tarefa?')) { await send({ type: 'athena_task_delete', id: b.dataset.del }); refreshTasks(); }
  }));
}

async function refreshHistory() {
  const r = await send({ type: 'athena_task_history' });
  if (!r || !r.ok) return;
  state.history = r.data;
  $('historyList').innerHTML = r.data.length
    ? r.data.map((h) => {
      const chip = h.status === 'ok' ? 'ok' : h.status === 'skipped' ? 'warn' : 'err';
      const when = new Date(h.finishedAt || h.startedAt).toLocaleString('pt-BR');
      return `<div class="item"><div class="item-head">
        <div><div class="item-title">${esc(h.name)} <span class="chip ${chip}">${esc(h.status)}</span></div>
        <div class="item-sub">${when} · ${esc(h.summary || h.error || '')}${h.reason === 'vault_locked' ? ' · 🔒 cofre bloqueado' : ''}</div></div>
      </div></div>`;
    }).join('')
    : '<div class="empty">Nenhuma execução registrada.</div>';
}

/* ---------------- init ---------------- */
refreshVault();
refreshCreds();
refreshMemory();
refreshTasks();
refreshHistory();
