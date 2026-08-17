// ====================================================================
// Athena Chrome Bridge — content script
// Executa comandos dentro da página: ler texto, clicar, preencher, etc.
// Também injeta o botão flutuante com a linha de comando para a IA.
// ====================================================================
// Substitui qualquer listener antigo (permite re-injeção sem duplicar)
if (window.__athenaListener) {
  try { chrome.runtime.onMessage.removeListener(window.__athenaListener); } catch (e) {}
}
window.__athenaListener = (msg, sender, sendResponse) => {
  // Mensagens da UI da IA (enviadas pelo background)
  if (msg && typeof msg === 'object') {
    if (msg.type === 'athena_toggle') {
      togglePanel();
      if (sendResponse) sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'athena_progress') { if (msg.text) addMsg('progress', msg.text); return false; }
    if (msg.type === 'athena_response') { if (msg.text) addMsg('ai', msg.text); return false; }
    if (msg.type === 'athena_error') { if (msg.text) addMsg('error', msg.text); return false; }
  }
  // Comandos de navegação/leitura da página
  run(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // resposta assíncrona
};
chrome.runtime.onMessage.addListener(window.__athenaListener);

const LABELS = {
  get_page_text: 'lendo o texto da página',
  get_html: 'capturando o HTML',
  read_page: 'lendo a página',
  find: 'buscando elementos',
  click: 'clicando em um elemento',
  fill: 'preenchendo um campo',
  evaluate: 'executando script',
  submit: 'enviando formulário',
};

async function run(msg) {
  const label = LABELS[msg.type];
  if (label) showToast(label);
  switch (msg.type) {
    case 'get_page_text':
      return { ok: true, text: document.body ? document.body.innerText : '' };
    case 'get_html': {
      const html = document.documentElement ? document.documentElement.outerHTML : '';
      return { ok: true, html: html.slice(0, 200000) };
    }
    case 'read_page':
      return {
        ok: true,
        title: document.title,
        url: location.href,
        text: (document.body ? document.body.innerText : '').slice(0, 50000),
      };
    case 'find':
      return find(msg.selector);
    case 'click':
      return click(msg.selector);
    case 'fill':
      return fill(msg.selector, msg.value);
    case 'submit':
      return submitForm(msg.selector);
    case 'evaluate':
      return evaluate(msg.script);
    default:
      return { ok: false, error: 'Comando desconhecido: ' + msg.type };
  }
}

// Toast flutuante que indica visualmente que a extensão está atuando
function showToast(label) {
  try {
    const old = document.getElementById('__athena_toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = '__athena_toast';
    el.textContent = '🦉 Athena: ' + label;
    el.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:2147483647;' +
      'background:linear-gradient(135deg,#6d5df6,#22d3ee);color:#fff;' +
      'font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:12px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.4);pointer-events:none;transition:opacity .3s;';
    (document.body || document.documentElement).appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 350);
    }, 2200);
  } catch (e) { /* ignore */ }
}

function find(selector) {
  if (!selector) return { ok: false, error: 'selector ausente' };
  const els = Array.from(document.querySelectorAll(selector));
  return {
    ok: true,
    count: els.length,
    matches: els.slice(0, 20).map((el) => ({
      tag: el.tagName,
      text: (el.innerText || el.value || '').slice(0, 200),
      href: el.href || null,
      id: el.id || null,
      name: el.name || null,
      type: el.type || null,
      placeholder: el.placeholder || null,
      value: el.value || null,
      className: typeof el.className === 'string' ? el.className : null,
      action: el.tagName === 'FORM' ? (el.action || null) : null,
    })),
  };
}

function click(selector) {
  let el = document.querySelector(selector);
  if (!el && selector && selector.startsWith('text=')) {
    const t = selector.slice(5).trim().toLowerCase();
    const cands = Array.from(document.querySelectorAll('button, a, input[type=submit], [role=button]'));
    el = cands.find((e) => (e.innerText || '').trim().toLowerCase() === t || (e.value || '').trim().toLowerCase() === t);
  }
  if (!el) return { ok: false, error: 'elemento não encontrado: ' + selector };
  el.scrollIntoView({ block: 'center' });
  el.click();
  return { ok: true, clicked: true, tag: el.tagName, text: (el.innerText || el.value || '').slice(0, 60) };
}

function submitForm(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: 'elemento não encontrado: ' + selector };
  const form = el.closest ? el.closest('form') : null;
  const target = form || (el.tagName === 'FORM' ? el : null);
  if (!target) return { ok: false, error: 'formulário não encontrado para ' + selector };
  if (typeof target.requestSubmit === 'function') { target.requestSubmit(); return { ok: true, submitted: true }; }
  if (typeof target.submit === 'function') { target.submit(); return { ok: true, submitted: true }; }
  return { ok: false, error: 'não foi possível enviar o formulário' };
}

function fill(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: 'elemento não encontrado: ' + selector };
  const proto =
    el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, filled: true };
}

function evaluate(script) {
  try {
    const result = new Function('return (' + script + ')')();
    let out = result;
    if (typeof result === 'object') out = JSON.stringify(result);
    return { ok: true, result: out };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// ====================================================================
// Botão flutuante + linha de comando para a IA
// ====================================================================
const ATHENA_UI_ID = '__athena_ui_host';
let athenaBusy = false;
let athenaPanel = null;
let athenaLog = null;
let athenaInput = null;
let athenaSend = null;

function ensureUi() {
  if (document.getElementById(ATHENA_UI_ID)) return;
  const host = document.createElement('div');
  host.id = ATHENA_UI_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .athena-fab {
        position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
        width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
        background: linear-gradient(135deg, #6d5df6, #22d3ee); color: #fff; font-size: 24px;
        box-shadow: 0 8px 24px rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center;
        transition: transform .15s ease, box-shadow .15s ease;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .athena-fab:hover { transform: scale(1.06); box-shadow: 0 10px 30px rgba(0,0,0,.55); }
      .athena-panel {
        position: fixed; right: 20px; bottom: 88px; z-index: 2147483647;
        width: 380px; max-width: calc(100vw - 40px);
        background: #0b0d14; color: #eef1f8;
        border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,.6);
        font: 13px/1.45 'Segoe UI', system-ui, sans-serif;
        display: none; flex-direction: column; overflow: hidden;
      }
      .athena-panel.open { display: flex; }
      .athena-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; background: rgba(255,255,255,.04);
        border-bottom: 1px solid rgba(255,255,255,.08); font-weight: 700; font-size: 13px;
      }
      .athena-close { background: none; border: none; color: #8b93ab; font-size: 15px; cursor: pointer; line-height: 1; }
      .athena-close:hover { color: #eef1f8; }
      .athena-log {
        padding: 10px 12px; max-height: 320px; overflow-y: auto;
        display: flex; flex-direction: column; gap: 8px;
      }
      .athena-msg { padding: 8px 10px; border-radius: 10px; white-space: pre-wrap; word-break: break-word; max-width: 100%; }
      .athena-msg.user { align-self: flex-end; background: linear-gradient(135deg,#6d5df6,#22d3ee); color: #fff; }
      .athena-msg.ai { align-self: flex-start; background: #151a2b; border: 1px solid rgba(255,255,255,.08); }
      .athena-msg.progress { align-self: flex-start; background: transparent; color: #8b93ab; font-size: 12px; padding: 2px 4px; }
      .athena-msg.error { align-self: flex-start; background: rgba(248,113,113,.12); border: 1px solid rgba(248,113,113,.3); color: #fca5a5; }
      .athena-foot { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.08); }
      .athena-input {
        flex: 1; min-width: 0; background: #151a2b; border: 1px solid rgba(255,255,255,.12);
        border-radius: 10px; color: #eef1f8; padding: 9px 12px; font: inherit; outline: none;
      }
      .athena-input:focus { border-color: #6d5df6; }
      .athena-input::placeholder { color: #5d647c; }
      .athena-send {
        background: linear-gradient(135deg,#6d5df6,#22d3ee); border: none; color: #fff;
        border-radius: 10px; padding: 0 16px; font-size: 14px; font-weight: 700; cursor: pointer;
      }
      .athena-send:disabled { opacity: .5; cursor: default; }
      .athena-tip { font-size: 11px; color: #8b93ab; padding: 2px 4px 0; }
    </style>
    <button class="athena-fab" id="fab" title="Athena — comando para a IA (Alt+Shift+A)">🦉</button>
    <div class="athena-panel" id="panel">
      <div class="athena-head"><span>🦉 Athena — comando para a IA</span><button class="athena-close" id="close" title="Fechar">✕</button></div>
      <div class="athena-log" id="log"></div>
      <div class="athena-foot">
        <input class="athena-input" id="input" placeholder="Digite um comando para a IA…" autocomplete="off">
        <button class="athena-send" id="send" title="Enviar">➤</button>
      </div>
    </div>
  `;
  (document.documentElement || document.body).appendChild(host);

  const fab = shadow.getElementById('fab');
  athenaPanel = shadow.getElementById('panel');
  athenaLog = shadow.getElementById('log');
  athenaInput = shadow.getElementById('input');
  athenaSend = shadow.getElementById('send');
  const close = shadow.getElementById('close');

  fab.addEventListener('click', togglePanel);
  close.addEventListener('click', closePanel);
  athenaSend.addEventListener('click', submitCommand);
  athenaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCommand();
    else if (e.key === 'Escape') closePanel();
  });
}

function togglePanel() {
  if (!athenaPanel) return;
  if (athenaPanel.classList.contains('open')) closePanel();
  else openPanel();
}

function openPanel() {
  if (!athenaPanel) return;
  athenaPanel.classList.add('open');
  setTimeout(() => { if (athenaInput) athenaInput.focus(); }, 50);
}

function closePanel() {
  if (athenaPanel) athenaPanel.classList.remove('open');
}

function addMsg(kind, text) {
  if (!athenaLog) return;
  const el = document.createElement('div');
  el.className = 'athena-msg ' + kind;
  el.textContent = text;
  athenaLog.appendChild(el);
  athenaLog.scrollTop = athenaLog.scrollHeight;
}

function setBusy(busy) {
  athenaBusy = busy;
  if (athenaInput) athenaInput.disabled = busy;
  if (athenaSend) athenaSend.disabled = busy;
}

async function submitCommand() {
  if (!athenaInput || athenaBusy) return;
  const text = athenaInput.value.trim();
  if (!text) return;
  addMsg('user', text);
  athenaInput.value = '';
  setBusy(true);
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'athena_command', text });
    if (!resp) throw new Error('sem resposta do background');
    if (resp.ok) {
      if (resp.text) addMsg('ai', resp.text);
    } else if (resp.error === 'sem_api_key') {
      addMsg('error', '⚠️ Configure sua chave de API: clique no ícone da extensão na barra do Chrome e depois em ⚙️ Configurações.');
    } else {
      addMsg('error', '⚠️ ' + (resp.error || 'erro desconhecido'));
    }
  } catch (e) {
    addMsg('error', '⚠️ ' + String((e && e.message) || e));
  } finally {
    setBusy(false);
    if (athenaInput) athenaInput.focus();
  }
}

if (document.documentElement) ensureUi();
else window.addEventListener('DOMContentLoaded', ensureUi, { once: true });
