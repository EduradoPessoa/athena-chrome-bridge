const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const statusUrl = document.getElementById('statusUrl');
const aiStatus = document.getElementById('aiStatus');
const vaultStatus = document.getElementById('vaultStatus');

function refresh() {
  chrome.storage.local.get(['status', 'url'], (data) => {
    const connected = data.status === 'connected';
    dot.classList.toggle('on', connected);
    statusText.textContent = connected ? 'Conectado ao servidor' : 'Desconectado';
    statusUrl.textContent = data.url || 'ws://localhost:9222';
  });
  chrome.storage.local.get(['apiKey'], (data) => {
    if (data.apiKey) {
      aiStatus.textContent = 'IA: chave de API configurada ✅';
      aiStatus.classList.add('ok');
    } else {
      aiStatus.textContent = 'IA: configure sua chave de API';
      aiStatus.classList.remove('ok');
    }
  });
  chrome.runtime.sendMessage({ type: 'athena_vault_status' }, (r) => {
    if (r && r.ok) {
      vaultStatus.textContent = r.exists
        ? (r.locked ? 'Cofre: 🔒 bloqueado' : 'Cofre: 🔓 desbloqueado')
        : 'Cofre: não configurado (senha-mestre)';
      vaultStatus.classList.toggle('ok', r.exists && !r.locked);
    }
  });
}

document.getElementById('reconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'reconnect' }, () => refresh());
});

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('schedule').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('schedule.html') });
});

refresh();
