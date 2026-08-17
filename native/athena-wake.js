#!/usr/bin/env node
// ====================================================================
// Athena Chrome Bridge — native host (Camada 2: agendar com Chrome fechado)
//
// Modos:
//   (padrão)  Native messaging com o Chrome (stdin/stdout, framing 4B LE + JSON)
//   --daemon  Agendador em segundo plano (lê schedule.json e abre o Chrome)
//
// O host NUNCA vê credenciais — apenas timestamps de tarefas e o caminho do Chrome.
// ====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const APP_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AthenaWake');
const SCHED_FILE = path.join(APP_DIR, 'schedule.json');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const POLL_MS = 30000;

/* ------------------------- utilitários ------------------------- */
function log(msg) {
  try { fs.appendFileSync(path.join(APP_DIR, 'host.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { /* sem log dir */ }
}

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function saveJSON(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj));
  } catch (e) { log('erro ao salvar ' + file + ': ' + e.message); }
}

function getChromePath() {
  const cfg = loadJSON(CONFIG_FILE, null);
  if (cfg && cfg.chromePath && fs.existsSync(cfg.chromePath)) return cfg.chromePath;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function isChromeParent() {
  if (process.env.ATHENA_TEST === '1') return true;
  try {
    const out = require('child_process').execSync(`tasklist /fi "PID eq ${process.ppid}" /fo csv /nh`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return /chrome\.exe/i.test(out);
  } catch (e) {
    return true; // sem como verificar → não bloqueia
  }
}

/* ------------------- native messaging (framing) ------------------- */
function writeMsg(obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(buf.length, 0);
  process.stdout.write(head);
  process.stdout.write(buf);
}

let inputBuf = Buffer.alloc(0);
function onData(chunk) {
  inputBuf = Buffer.concat([inputBuf, chunk]);
  while (inputBuf.length >= 4) {
    const len = inputBuf.readUInt32LE(0);
    if (inputBuf.length < 4 + len) return;
    const payload = inputBuf.subarray(4, 4 + len).toString('utf8');
    inputBuf = inputBuf.subarray(4 + len);
    let msg;
    try { msg = JSON.parse(payload); } catch (e) { continue; }
    handleNative(msg);
  }
}

async function handleNative(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ping') {
    writeMsg({ type: 'pong', parentIsChrome: isChromeParent() });
    return;
  }
  if (msg.type === 'sync_schedule') {
    const nextRuns = Array.isArray(msg.nextRuns) ? msg.nextRuns : [];
    saveJSON(SCHED_FILE, { nextRuns, updatedAt: Date.now() });
    writeMsg({ type: 'synced', count: nextRuns.length });
    return;
  }
  if (msg.type === 'chrome_up') {
    writeMsg({ type: 'ready', version: '1.0.0' });
    return;
  }
}

/* ------------------------- modo daemon ------------------------- */
const DRY_RUN = process.argv.includes('--dry-run'); // não abre o Chrome (testes)

function launchChrome() {
  if (DRY_RUN) {
    log('DRY-RUN: abriria o Chrome');
    return true;
  }
  const chrome = getChromePath();
  if (!chrome) { log('chrome.exe não encontrado'); return false; }
  try {
    const p = spawn(chrome, [], { detached: true, stdio: 'ignore' });
    p.unref();
    return true;
  } catch (e) {
    log('falha ao abrir Chrome: ' + e.message);
    return false;
  }
}

function daemonTick() {
  const sched = loadJSON(SCHED_FILE, { nextRuns: [] });
  const nextRuns = sched.nextRuns || [];
  const now = Date.now();
  const due = nextRuns.filter((r) => r.at && r.at <= now).sort((a, b) => a.at - b.at);
  if (due.length) {
    log(`abrindo Chrome para ${due.length} tarefa(s) vencida(s) [${due.map((d) => d.id).join(', ')}]`);
    launchChrome();
    saveJSON(SCHED_FILE, { nextRuns: nextRuns.filter((r) => !due.includes(r)), updatedAt: now });
  }
}

function runDaemon() {
  // lock simples contra daemon duplicado
  let lock;
  try {
    fs.mkdirSync(APP_DIR, { recursive: true });
    lock = fs.openSync(path.join(APP_DIR, 'daemon.lock'), 'wx');
  } catch (e) {
    process.exit(0); // outro daemon já está rodando
  }
  log('daemon iniciado');
  const tick = () => {
    daemonTick();
    // acorda no vencimento mais próximo (ou no polling, o que vier antes)
    const sched = loadJSON(SCHED_FILE, { nextRuns: [] });
    const nextAt = Math.min(...(sched.nextRuns || []).map((r) => r.at).filter(Boolean));
    const delay = nextAt && nextAt > Date.now() ? Math.min(nextAt - Date.now() + 500, POLL_MS) : POLL_MS;
    setTimeout(tick, Math.max(1000, delay));
  };
  tick();
}

/* ------------------------- entrada ------------------------- */
if (process.argv.includes('--daemon')) {
  runDaemon();
} else {
  process.stdin.on('data', onData);
  process.stdin.resume();
}
