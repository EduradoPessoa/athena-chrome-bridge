// ====================================================================
// Athena Chrome Bridge — servidor ponte
// - WebSocket (9222): recebe a conexão da extensão do Chrome
// - HTTP API (3001): interface para o agente de IA enviar comandos
// ====================================================================
const http = require('http');
const { WebSocketServer } = require('ws');

const WS_PORT = 9222;
const HTTP_PORT = 3001;
const CMD_TIMEOUT = 20000;

let extSocket = null;
let seq = 0;
const pending = new Map();

/* ------------------------- WebSocket (extensão) ------------------------- */
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (socket) => {
  extSocket = socket;
  console.log('[bridge] extensão conectada');

  socket.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'result') {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error || 'erro'));
      }
    }
  });

  socket.on('close', () => {
    if (extSocket === socket) extSocket = null;
    console.log('[bridge] extensão desconectada');
  });

  socket.on('error', () => {});
});

/* ------------------------- HTTP API (agente) ------------------------- */
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/status') {
    return res.end(JSON.stringify({ connected: !!extSocket, wsPort: WS_PORT }));
  }

  if (req.method === 'POST' && url.pathname === '/api/command') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const cmd = JSON.parse(body || '{}');
        const result = await sendCommand(cmd);
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(HTTP_PORT, () => {
  console.log(`[bridge] HTTP API   -> http://localhost:${HTTP_PORT}/api`);
  console.log(`[bridge] WebSocket  -> ws://localhost:${WS_PORT}`);
  console.log('[bridge] aguardando a extensão do Chrome…');
});

/* ------------------------- envio de comandos ------------------------- */
function sendCommand(cmd, timeoutMs = CMD_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (!extSocket) {
      return reject(new Error('Extensão não conectada. Instale e abra a extensão no Chrome.'));
    }
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Timeout aguardando resposta da extensão'));
    }, timeoutMs);
    pending.set(id, {
      resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    extSocket.send(JSON.stringify({ id, ...cmd }));
  });
}

setInterval(() => {
  if (extSocket) extSocket.send(JSON.stringify({ type: 'ping' }));
}, 15000);
