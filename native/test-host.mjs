// ====================================================================
// Athena Chrome Bridge — teste de integração do native host
// Simula o Chrome: spawn do host, troca de mensagens com framing 4B LE.
// Rode: node native/test-host.mjs
// ====================================================================
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';

const dir = path.dirname(fileURLToPath(import.meta.url));
const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-wake-'));
const child = spawn(process.execPath, ['athena-wake.js'], {
  cwd: dir,
  env: { ...process.env, ATHENA_TEST: '1', LOCALAPPDATA: localAppData },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let outBuf = Buffer.alloc(0);
const frames = [];
child.stdout.on('data', (c) => {
  outBuf = Buffer.concat([outBuf, c]);
  while (outBuf.length >= 4) {
    const len = outBuf.readUInt32LE(0);
    if (outBuf.length < 4 + len) break;
    frames.push(JSON.parse(outBuf.subarray(4, 4 + len).toString('utf8')));
    outBuf = outBuf.subarray(4 + len);
  }
});

function send(obj) {
  const b = Buffer.from(JSON.stringify(obj));
  const h = Buffer.alloc(4);
  h.writeUInt32LE(b.length, 0);
  child.stdin.write(h);
  child.stdin.write(b);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) ping → pong
send({ type: 'ping' });
await wait(400);
assert.equal(frames[0]?.type, 'pong', 'esperava pong após ping');
console.log('OK 1/3 ping → pong');

// 2) sync_schedule → synced + schedule.json gravado
const at = Date.now() + 60000;
send({ type: 'sync_schedule', nextRuns: [{ id: 't_1', name: 'Teste', at }] });
await wait(400);
assert.equal(frames[1]?.type, 'synced', 'esperava synced após sync_schedule');
const sched = JSON.parse(fs.readFileSync(path.join(localAppData, 'AthenaWake', 'schedule.json'), 'utf8'));
assert.equal(sched.nextRuns[0].id, 't_1');
assert.equal(sched.nextRuns[0].at, at);
console.log('OK 2/3 sync_schedule → schedule.json gravado');

// 3) chrome_up → ready
send({ type: 'chrome_up' });
await wait(400);
assert.equal(frames[2]?.type, 'ready', 'esperava ready após chrome_up');
console.log('OK 3/3 chrome_up → ready');

child.kill();
console.log('\n✅ TESTE DO HOST PASSOU (framing + protocolo)');
process.exit(0);
