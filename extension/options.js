// ====================================================================
// Athena Chrome Bridge — página de Configurações
// Salva a chave de API (e URL/modelo) no chrome.storage.local.
// ====================================================================
const DEFAULT_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

const apiKeyEl = document.getElementById('apiKey');
const apiUrlEl = document.getElementById('apiUrl');
const modelEl = document.getElementById('model');
const statusEl = document.getElementById('status');
const testBtn = document.getElementById('test');
const clearBtn = document.getElementById('clear');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

async function load() {
  const data = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
  apiKeyEl.value = data.apiKey || '';
  apiUrlEl.value = data.apiUrl || DEFAULT_URL;
  modelEl.value = data.model || DEFAULT_MODEL;
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    apiKey: apiKeyEl.value.trim(),
    apiUrl: apiUrlEl.value.trim() || DEFAULT_URL,
    model: modelEl.value.trim() || DEFAULT_MODEL,
  });
  setStatus('✅ Configurações salvas.', 'ok');
});

testBtn.addEventListener('click', async () => {
  const key = apiKeyEl.value.trim();
  const url = apiUrlEl.value.trim() || DEFAULT_URL;
  const model = modelEl.value.trim() || DEFAULT_MODEL;

  if (!key) { setStatus('⚠️ Informe a chave da API antes de testar.', 'err'); return; }

  testBtn.disabled = true;
  setStatus('⏳ Testando conexão…');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Responda apenas: ok' }],
        max_tokens: 5,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (t ? ' — ' + t.slice(0, 200) : ''));
    }
    await res.json();
    setStatus('✅ Conexão OK! Chave válida para o modelo "' + model + '".', 'ok');
  } catch (e) {
    const reason = e && e.name === 'AbortError' ? 'tempo esgotado' : String((e && e.message) || e);
    setStatus('❌ Falha no teste: ' + reason, 'err');
  } finally {
    clearTimeout(timer);
    testBtn.disabled = false;
  }
});

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiKey', 'apiUrl', 'model']);
  apiKeyEl.value = '';
  apiUrlEl.value = DEFAULT_URL;
  modelEl.value = DEFAULT_MODEL;
  setStatus('🗑️ Chave de API removida. Use a chave do seu provedor para voltar a usar a IA.', 'ok');
});

load();
