const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const statusUrl = document.getElementById('statusUrl');
const aiStatus = document.getElementById('aiStatus');

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
}

document.getElementById('reconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'reconnect' }, () => refresh());
});

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
