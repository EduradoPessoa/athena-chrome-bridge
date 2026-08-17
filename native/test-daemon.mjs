// ====================================================================
// Athena Chrome Bridge — teste do daemon (sem abrir o Chrome de verdade)
// Rode: node native/test-daemon.mjs
// ====================================================================
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';

const dir = path.dirname(fileURLToPath(import.meta.url));
const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-daemon-'));
const appDir = path.join(localAppData, 'AthenaWake');
fs.mkdirSync(appDir, { recursive: true });

// agenda uma tarefa para vencer em 1,5s
const at = Date.now() + 1500;
fs.writeFileSync(path.join(appDir, 'schedule.json'), JSON.stringify({ nextRuns: [{ id: 't_1', name: 'Teste', at }], updatedAt: Date.now() }));

const child = spawn(process.execPath, ['athena-wake.js', '--daemon', '--dry-run'], {
  cwd: dir,
  env: { ...process.env, LOCALAPPDATA: localAppData },
  stdio: 'ignore',
});

await new Promise((r) => setTimeout(r, 3200));

// 1) log registrou a abertura
const log = fs.readFileSync(path.join(appDir, 'host.log'), 'utf8');
assert.ok(log.includes('abrindo Chrome para 1 tarefa(s) vencida(s) [t_1]'), 'daemon deveria registrar abertura: ' + log);
console.log('OK 1/3 daemon detectou tarefa vencida');

// 2) dry-run não abriu o Chrome de verdade
assert.ok(log.includes('DRY-RUN'), 'esperava modo dry-run');
console.log('OK 2/3 dry-run (Chrome não aberto)');

// 3) schedule.json atualizado (vencida removida)
const sched = JSON.parse(fs.readFileSync(path.join(appDir, 'schedule.json'), 'utf8'));
assert.equal(sched.nextRuns.length, 0, 'tarefa vencida deveria sair do schedule');
console.log('OK 3/3 schedule.json atualizado');

child.kill();
console.log('\n✅ TESTE DO DAEMON PASSOU');
process.exit(0);
