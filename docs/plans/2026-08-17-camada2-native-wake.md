# Camada 2 — Agendamento com Chrome fechado (Native Wake) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Permitir que tarefas agendadas da Athena Chrome Bridge executem mesmo com o Chrome **totalmente fechado**, usando um **host nativo** (companion) que roda no Windows, abre o Chrome na hora devida e sincroniza a agenda com a extensão via **native messaging**.

**Architecture:** Um host nativo em **Node.js** (zero dependências) roda de duas formas: (1) **daemon** — iniciado no logon (chave `HKCU\...\Run`), lê `schedule.json` a cada 30s e abre o Chrome quando a próxima tarefa vence; (2) **host de native messaging** — iniciado pelo Chrome, recebe `sync_schedule`/`chrome_up`/`ping` e grava `schedule.json`. A extensão (MV3) ganha a permissão `nativeMessaging`, sincroniza a agenda a cada mudança de tarefa e, no `onStartup`, executa tarefas que venceram com o Chrome fechado (catch-up). O host **nunca** tem acesso a credenciais — só a timestamps e ao caminho do Chrome.

**Tech Stack:** Node.js 22 (stdio framing, `child_process`, `fs`), PowerShell (instalação/registro), Chrome Extensions MV3 (`nativeMessaging`, `chrome.runtime.onStartup`, `chrome.runtime.connectNative`), manifest de host nativo (`com.phoenyx.athena`), agendador existente (`scheduler.js`).

**Non-goals (YAGNI):** executar ações de navegação sem o Chrome (impossível para uma extensão), sincronização multi-dispositivo do host, suporte a Linux/macOS (host é Windows-first), empacotamento MSI/assinatura digital (fica como nota de produção).

---

## Segurança (vínculo do produto)

1. O host nativo **apenas** armazena `{id, name, at}` e abre o Chrome — **nenhuma credencial**, nenhum conteúdo de página, nenhum log de dados.
2. O `schedule.json` fica em `%LOCALAPPDATA%\AthenaWake\` (perfil do usuário, sem privilégios elevados).
3. Hardening: o host valida que o processo pai é `chrome.exe` antes de responder no modo native messaging.
4. `uninstall.ps1` remove registro, arquivos e chave de auto-início.

## Fluxo

```
Usuário cria tarefa (UI Agendamentos)
        │  background: athena_task_save
        ▼
background.js ── sync_schedule (native messaging) ──► host (modo native messaging)
        │                                                 │ grava schedule.json
        ▼                                                 ▼
Chrome fecha ───────────────────────────────────────► daemon (logon) lê schedule.json a cada 30s
                                                          │ venceu? (nextRun <= now)
                                                          ▼
                                                   spawn chrome.exe
                                                          │
Chrome abre → chrome.runtime.onStartup → catch-up: roda tarefas vencidas → sync_schedule novo
```

## Modelo de dados

```jsonc
// %LOCALAPPDATA%\AthenaWake\schedule.json
{
  "nextRuns": [
    { "id": "t_abc", "name": "Login diário", "at": 1787200000000 }
  ],
  "updatedAt": 1787000000000
}

// Protocolo native messaging (JSON por mensagem; framing: 4 bytes LE de tamanho + payload)
// Extensão → host
{ "type": "ping" }
{ "type": "sync_schedule", "nextRuns": [{ "id": "t_abc", "name": "Login diário", "at": 1787200000000 }] }
{ "type": "chrome_up" }
// Host → extensão
{ "type": "pong" }
{ "type": "ready", "version": "1.0.0" }
{ "type": "launching_chrome", "id": "t_abc" }
```

## Estrutura de arquivos

```
native/
├── athena-wake.js        CRIAR  host (daemon + native messaging)
├── athena-wake.cmd       CRIAR  shim: node "%~dp0athena-wake.js"
├── manifest.json         CRIAR  manifest do host nativo (template)
├── install.ps1           CRIAR  build/registro + auto-início + desinstalação
└── test-host.ps1         CRIAR  teste de integração (framing via stdin/stdout)
extension/
├── manifest.json         MODIFICAR  + "nativeMessaging"
├── background.js         MODIFICAR  sync_schedule, onStartup catch-up, status do companion
├── schedule.js/html      MODIFICAR  status do companion + botão instalar/abrir docs
docs/plans/2026-08-17-camada2-native-wake.md   (este plano)
```

---

## Task 1: Host — framing de native messaging + ping/pong (TDD via script)

**Files:**
- Create: `native/athena-wake.js`
- Create: `native/test-host.ps1`

**Step 1:** Escrever o teste `native/test-host.ps1` que simula o Chrome:
```powershell
# inicia o host e envia {type:'ping'} com framing de 4 bytes LE
$p = Start-Process node -ArgumentList 'athena-wake.js' -PassThru -RedirectStandardInput in.bin -RedirectStandardOutput out.bin ...
```
> Na execução, preferir um teste em Node (`node --test`) que faz `spawn` do host e troca mensagens — mais determinístico que PowerShell com pipes binários. O `test-host.ps1` vira o teste manual de integração.

**Step 2:** Implementar `native/athena-wake.js`:
```js
// framing: 4 bytes little-endian de tamanho + JSON UTF-8
function readMsg() { /* async iterador sobre process.stdin (Buffers) */ }
function writeMsg(obj) { const buf = Buffer.from(JSON.stringify(obj)); const head = Buffer.alloc(4); head.writeUInt32LE(buf.length, 0); process.stdout.write(head); process.stdout.write(buf); }
// loop: aguarda 'ping' → responde 'pong'
```
Requisitos: sem dependências; `--daemon` ativa o modo agendador (Task 2); default = native messaging.

**Step 3:** Teste: iniciar host, enviar `ping` com framing, conferir `pong` na saída; timeout de 5s.

**Step 4:** Commit: `git commit -am "feat(native): host com framing de native messaging e ping/pong"`

---

## Task 2: Host — daemon (schedule.json + abrir Chrome) + instalação

**Files:**
- Modify: `native/athena-wake.js`
- Create: `native/manifest.json` (template)
- Create: `native/install.ps1`, `native/uninstall.ps1`

**Step 1:** Daemon:
```js
const SCHED_FILE = path.join(process.env.LOCALAPPDATA, 'AthenaWake', 'schedule.json');
function loadSchedule() { try { return JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')); } catch { return { nextRuns: [] }; } }
// loop (a cada 30s):
//   nextRuns.filter(r => r.at <= Date.now()).sort(por at) → venceu?
//   spawn(process.env.ChromePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [], { detached: true, stdio: 'ignore' }).unref()
//   atualizar schedule.json removendo o item vencido (o Chrome fará catch-up e re-sincroniza)
```
> Detectar caminho do Chrome: registrar `HKLM\...\App Paths\chrome.exe` via `reg query` no install.ps1 e gravar em `%LOCALAPPDATA%\AthenaWake\config.json` (ou usar o caminho padrão com fallback).

**Step 2:** `native/manifest.json` (template; o install.ps1 gera a versão final com caminhos absolutos):
```json
{
  "name": "com.phoenyx.athena",
  "description": "Athena Chrome Bridge — agendador com Chrome fechado",
  "path": "C:\\<CAMINHO>\\athena-wake.cmd",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<ID_DA_EXTENSAO>/"]
}
```
> `allowed_origins` precisa do **ID real da extensão** (estável quando carregada com "Fixar extensão" no chrome://extensions; em produção, é o ID da Chrome Web Store). O install.ps1 lê o ID da extensão da entrada "Carregada" (ou o usuário informa) e o grava.

**Step 3:** `install.ps1`:
- grava `config.json` com o caminho do Chrome (via `reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"`);
- grava `manifest.json` final em `%LOCALAPPDATA%\AthenaWake\` com `path` absoluto para `athena-wake.cmd` e `allowed_origins` com o ID da extensão;
- registra `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.phoenyx.athena` → caminho do manifest;
- cria auto-início: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` → `"AthenaWake" = "wscript ... node athena-wake.js --daemon"` (usar `cmd /c start "" /b node …` para não abrir janela);
- `uninstall.ps1`: remove registro, Run key e `%LOCALAPPDATA%\AthenaWake\`.

**Step 4:** Validação manual: rodar `node athena-wake.js --daemon`, criar `schedule.json` com `at` = now+10s, conferir que o Chrome abre.

**Step 5:** Commit: `git commit -am "feat(native): daemon com schedule.json, abertura do Chrome e instalador"`

---

## Task 3: Extensão — nativeMessaging + sync + catch-up

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/background.js`

**Step 1:** Manifest: adicionar `"nativeMessaging"` em `permissions`; versão → `1.4.0`.

**Step 2:** `background.js`:
```js
const NATIVE_HOST = 'com.phoenyx.athena';
let nativePort = null;

function connectNative() {
  try { nativePort = chrome.runtime.connectNative(NATIVE_HOST); } catch (e) { nativePort = null; return; }
  nativePort.onDisconnect.addListener(() => { nativePort = null; });
  nativePort.onMessage.addListener((m) => { if (m && m.type === 'pong') companionOk = true; });
  nativePort.postMessage({ type: 'ping' });
}
async function syncSchedule() {
  if (!nativePort) return;
  const data = await chrome.storage.local.get('athena.tasks');
  const tasks = (data['athena.tasks'] || []).filter((t) => t.enabled && t.nextRun);
  nativePort.postMessage({ type: 'sync_schedule', nextRuns: tasks.map((t) => ({ id: t.id, name: t.name, at: t.nextRun })) });
}
chrome.runtime.onStartup.addListener(async () => {
  connectNative();
  await catchUpMissed();
  syncSchedule();
});
// chamar syncSchedule() também em athena_task_save/delete/run_now e após schedulerTick
```
**Catch-up:** no `onStartup` e no primeiro tick, para tarefas com `nextRun <= now` (vencidas com o Chrome fechado), executar normalmente (mesmo `executeTask`), registrando no histórico; após, `syncSchedule()`.

**Step 3:** Smoke test (mocks): iniciar com `athena_task_save` de uma tarefa `once` no passado → `onStartup`/tick roda catch-up → histórico `ok` e `sync_schedule` enviado ao host mockado.

**Step 4:** Commit: `git commit -am "feat(extension): nativeMessaging, sync de agenda e catch-up no startup"`

---

## Task 4: UI — status do companion em Agendamentos

**Files:**
- Modify: `extension/schedule.html`, `extension/schedule.js`

**Step 1:** No topo da aba Tarefas (abaixo do banner da Camada 1), uma linha de status:
- `🔌 Companion: instalado e conectado` (verde) | `não instalado` (amarelo) | `instalado, mas não conectado` (cinza).
- Detecção: `chrome.runtime.sendNativeMessage(NATIVE_HOST, {type:'ping'})` com timeout; se erro `native_host_not_found` → não instalado.
- Botão **"Como instalar"** abre `README.md#camada-2` (ou exibe bloco com os passos do `install.ps1`).

**Step 2:** Teste manual: sem host → status "não instalado"; com `install.ps1` + extensão recarregada → "conectado".

**Step 3:** Commit: `git commit -am "feat(schedule): status do companion nativo na UI"`

---

## Task 5: Testes finais, docs e empacotamento

**Files:**
- Modify: `README.md`, `POLITICA-DE-PRIVACIDADE.md`, `CHROME-WEB-STORE.md`
- Modify: `extension/manifest.json` (versão)

**Step 1:** README — seção **Camada 2 (agendar com Chrome fechado)**: instalação (`powershell -ExecutionPolicy Bypass -File native/install.ps1`), como funciona, limitações (Windows, requer Node.js 22 ou exe empacotado via `nexe`), segurança (host não vê credenciais).
**Step 2:** Privacidade — nota: o companion armazena apenas timestamps de tarefas em `%LOCALAPPDATA%` e abre o Chrome; não coleta dados.
**Step 3:** Loja — justificativa da permissão `nativeMessaging` (comunicação com o companion opcional do usuário).
**Step 4:** Suíte completa: `npm test` (15) + smoke da extensão + teste de integração do host (ping/pong). Gerar zip `v1.4.0`.
**Step 5:** Commit: `git commit -am "docs: Camada 2 (native wake) no README, politica e loja"`

---

## Checklist manual (pós-merge, com Chrome real)

1. `powershell -ExecutionPolicy Bypass -File native/install.ps1` (informar o ID da extensão).
2. `chrome://extensions` → recarregar → Agendamentos mostra "Companion: instalado e conectado".
3. Criar tarefa `once` para daqui a 2 min → **fechar o Chrome** → aguardar → o Chrome abre sozinho e a tarefa roda (histórico `ok` + notificação).
4. Criar tarefa que vence com Chrome fechado por 1h → abrir Chrome manualmente → catch-up executa e registra.
5. Desinstalar: `native/uninstall.ps1` → status volta a "não instalado".

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `allowed_origins` exige ID estável da extensão | Documentar: fixar o ID no chrome://extensions (dev) ou usar o ID da loja (produção); install.ps1 recebe o ID por parâmetro |
| Chrome spawn pelo host abre com perfil errado | Host abre com o perfil padrão; extensão roda em qualquer perfil onde esteja instalada |
| Daemon duplicado (dois processos) | install.ps1 usa chave única do Run; host usa lock simples (`fs.openSync` exclusivo) |
| `.cmd` como `path` do host pode falhar em algumas versões | Task 1 valida; fallback: empacotar `athena-wake.js` em exe único via `npx nexe` e apontar `path` para o exe |
| Antivírus pode questionar host nativo | Documentar que o host só abre o Chrome e lê `schedule.json`; sugerir assinatura digital em produção |
| Chrome em execução ao vencimento | `chrome.exe` reutiliza o processo existente (single-instance) — sem janela duplicada problemática |
