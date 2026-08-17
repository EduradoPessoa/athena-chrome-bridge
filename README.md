# 🦉 Athena Chrome Bridge

> Controle o navegador com IA: uma extensão Chrome (Manifest V3) + servidor ponte
> que permite a um agente de IA **ler e controlar o Chrome** — navegar, extrair
> conteúdo, interagir com elementos, executar JavaScript e capturar screenshots —
> além de uma **linha de comando flutuante** para conversar com a IA de qualquer página.

> 🔒 **Segurança em primeiro lugar** — sem telemetria, sem coleta em segundo plano e
> nada sai da sua máquina sem um comando seu. A chave de API fica no
> `chrome.storage.local` e o conteúdo da página só é enviado ao provedor de IA que
> **você** configurou, no momento do comando. Detalhes na seção
> [Segurança e privacidade](#-seguranca-e-privacidade).

> 🌐 **Landing page oficial:** https://eduradopessoa.github.io/athena-chrome-bridge/

O projeto tem dois componentes que trabalham juntos:

| Componente | Papel |
|---|---|
| `extension/` | Extensão Chrome: botão flutuante, linha de comando da IA, **agendamento de tarefas** e cofre de credenciais |
| `server/` | Servidor ponte: API HTTP + WebSocket para agentes externos, servidor MCP (stdio) e agente DeepSeek |

---

## ✨ Funcionalidades

- **Botão flutuante com linha de comando** — clique no 🦉 em qualquer página e dê comandos em linguagem natural para a IA (ex.: *"abra o Google e me diga qual é o título da página"*).
- **Chave de API configurável** — a extensão guarda a chave (DeepSeek ou qualquer provedor OpenAI-compatible) no armazenamento local do Chrome; nada sai da sua máquina.
- **⏰ Agendamento de tarefas** — data, hora e recorrência (diária/semanal/mensal) com contexto, memória e perfis de login, executadas automaticamente pelo service worker.
- **🔐 Cofre de credenciais** — senhas de sites criptografadas (AES-GCM 256) com senha-mestre; a chave fica só em memória e o cofre bloqueia ao reiniciar o Chrome.
- **12 ferramentas de controle do navegador** — navegar, abrir abas, ler texto/HTML, buscar elementos, clicar, preencher formulários, executar JavaScript e tirar screenshots.
- **Servidor ponte** — API HTTP em `localhost:3001` + WebSocket em `localhost:9222` para agentes externos controlarem o navegador.
- **Servidor MCP (stdio)** — exponha as ferramentas para qualquer cliente MCP (Claude Code, Cursor, etc.).
- **Atalho de teclado** — `Alt+Shift+A` abre/fecha a linha de comando.

## 🏗️ Arquitetura

```
                    ┌─────────────────────── WebSocket (9222) ───────────────────────┐
                    ▼                                                                ▼
Agente de IA ──HTTP──► Servidor ponte (Node) ────────────────► Extensão (MV3) ──► Página
(fetch / MCP)   localhost:3001/api                            background ──► content script
                                                                    ▲
Linha de comando da IA (botão flutuante) ── chrome.runtime ─────────┘
   (chamadas diretas à API do provedor)
```

Dois caminhos de uso:

1. **Linha de comando flutuante (modo direto)** — a extensão chama a API do provedor de IA com a chave salva nas configurações e executa as ferramentas no navegador. Não depende do servidor ponte.
2. **Agentes externos (via ponte)** — um agente de IA (via API HTTP ou MCP) envia comandos estruturados; o servidor ponte os encaminha pela WebSocket para a extensão, que os executa na página ativa.

## 📋 Pré-requisitos

- **Node.js 18+** (para o servidor ponte / MCP)
- **Google Chrome 116+** (Manifest V3, service worker com WebSocket)
- **Uma chave de API** de provedor OpenAI-compatible (ex.: DeepSeek) para usar a linha de comando da IA

## 🚀 Instalação

### 1) Servidor ponte (opcional — necessário só para agentes externos)

```bash
cd server
npm install
npm start
```

A API HTTP sobe em `http://localhost:3001/api` e o WebSocket em `ws://localhost:9222`.

### 2) Extensão no Chrome

1. Abra `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`
4. O popup deve mostrar **"Conectado ao servidor"** (verde) quando o servidor ponte estiver rodando

> **Dica:** para desenvolver com recarga automática, use o recurso "Recarregar" (`Ctrl+R`) na página da extensão após cada alteração nos arquivos.

## 🦉 Usar a linha de comando da IA

1. **Configure a chave de API** (ver seção abaixo) — sem ela, a IA avisa no próprio painel.
2. Clique no botão flutuante **🦉** (canto inferior direito) ou use `Alt+Shift+A`.
3. Digite o comando em linguagem natural e pressione `Enter`:

```
abra o google e me diga qual é o título da página
```

A IA decide quais ferramentas usar (o painel mostra cada ação executada, ex.: `🔧 navigate {url: ...}`) e exibe a resposta final na conversa. `Esc` fecha o painel.

## ⚙️ Configuração (chave de API)

No popup da extensão, ao lado do botão **Reconectar**, clique em **⚙️ Configurações** (ou abra `chrome-extension://<id-da-extensao>/options.html`).

| Campo | Padrão | Descrição |
|---|---|---|
| Chave da API | — | Chave do provedor (DeepSeek ou OpenAI-compatible) |
| URL da API | `https://api.deepseek.com/chat/completions` | Endpoint de chat completions |
| Modelo | `deepseek-chat` | Modelo usado pela linha de comando |

- **Salvar** — grava as configurações no `chrome.storage.local`.
- **Testar conexão** — envia uma requisição mínima para validar chave/modelo.
- **Limpar** — remove a chave do Chrome.

A chave **nunca sai da extensão**: as chamadas vão direto do navegador para a API do provedor.

## 🤖 Integração com agentes de IA

### API HTTP (servidor ponte)

`POST http://localhost:3001/api/command` com um comando estruturado:

| Comando | Descrição |
|---|---|
| `{ "type": "navigate", "url": "https://..." }` | Navega a aba ativa para uma URL |
| `{ "type": "open_tab", "url": "https://..." }` | Abre uma nova aba no grupo Athena |
| `{ "type": "list_tabs" }` | Lista as abas abertas |
| `{ "type": "activate_tab", "tabId": 123 }` | Ativa uma aba |
| `{ "type": "read_page" }` | Título + URL + texto visível da página |
| `{ "type": "get_page_text" }` | Texto bruto da página (`innerText`) |
| `{ "type": "get_html" }` | HTML da página (truncado) |
| `{ "type": "find", "selector": "a.btn" }` | Busca elementos por seletor CSS |
| `{ "type": "click", "selector": "button" }` | Clica em um elemento |
| `{ "type": "fill", "selector": "input", "value": "texto" }` | Preenche um campo |
| `{ "type": "evaluate", "script": "document.title" }` | Executa JavaScript na página |
| `{ "type": "screenshot" }` | Screenshot da aba ativa (dataURL PNG) |

```bash
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"read_page"}'
```

### Servidor MCP (recomendado para agentes)

```bash
cd server
npm install
node mcp.mjs
```

Registre no seu cliente MCP apontando para o caminho do repositório clonado:

```json
{
  "mcpServers": {
    "athena-chrome": {
      "command": "node",
      "args": ["/caminho/para/athena-chrome-bridge/server/mcp.mjs"]
    }
  }
}
```

Ou pelo Claude Code:

```bash
claude mcp add athena-chrome -- node /caminho/para/athena-chrome-bridge/server/mcp.mjs
```

### Agente DeepSeek (function calling)

```bash
cd server
export DEEPSEEK_API_KEY="sk-..."
node deepseek-agent.mjs "abra o google e leia o título da página"
```

O agente usa a API da DeepSeek (OpenAI-compatible) com *function calling* para decidir quais comandos executar e os envia pela ponte.

## 🔎 Verificação rápida

Com o servidor ponte rodando e a extensão carregada:

```bash
# status da conexão
curl http://localhost:3001/api/status

# listar abas abertas
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"list_tabs"}'

# ler a página ativa
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"read_page"}'

# buscar links na página
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"find","selector":"a"}'
```

## 📁 Estrutura do projeto

```
athena-chrome-bridge/
├── extension/            # Extensão Chrome (Manifest V3)
│   ├── manifest.json     # Permissões, ícones, atalhos e páginas da extensão
│   ├── background.js     # Service worker: WebSocket, comandos, loop da IA, agendador e cofre
│   ├── content.js        # Executa comandos na página + botão flutuante
│   ├── scheduler.js      # Recorrência/nextRun (lógica pura, testável)
│   ├── vault.js          # Cofre AES-GCM/PBKDF2 (lógica pura, testável)
│   ├── popup.html/.js    # Popup com status, reconexão, configurações e agendamentos
│   ├── options.html/.js  # Página de configurações (chave de API)
│   ├── schedule.html/.js # Agendamentos: tarefas, cofre e memória
│   └── icons/            # Ícones da extensão (16/32/48/128)
├── test/                 # Testes node:test (scheduler + vault)
├── native/               # Companion nativo (Camada 2): host Node, instalador e testes
├── scripts/              # Geração de ícones e empacotamento para a loja
├── docs/plans/           # Planos de implementação
├── POLITICA-DE-PRIVACIDADE.md
├── CHROME-WEB-STORE.md
└── server/               # Servidor ponte
    ├── bridge.js         # API HTTP (3001) + WebSocket (9222)
    ├── mcp.mjs           # Servidor MCP (stdio)
    ├── deepseek-agent.mjs # Agente DeepSeek com function calling
    └── package.json
```

## ⏰ Agendamento de tarefas

Automatize rotinas com **data, hora e recorrência** (uma vez, diária, semanal com
dias, mensal) — com fuso horário configurável. Cada tarefa guarda:

- **Contexto** — observações sobre o ambiente/cliente usadas na execução;
- **Memória** — notas reutilizáveis (chave + texto + tags) anexadas à tarefa;
- **Credenciais** — perfis de login (URL + seletores + usuário/senha) guardados
  **criptografados** em um cofre com **senha-mestre** (AES-GCM 256, chave derivada
  por PBKDF2 e mantida apenas em memória);
- **Passos** — modo `script` (navegar → login → clicar → screenshot, etc.) ou modo
  `ai` (instrução em linguagem natural com contexto + memória).

Abra **⏰ Agendamentos** pelo popup da extensão (`schedule.html`) para criar tarefas,
gerenciar o cofre e a memória e acompanhar o histórico de execuções.

### Por dentro (para contribuidores)

**Armazenamento** (`chrome.storage.local`):

| Chave | Conteúdo |
|---|---|
| `athena.tasks` | Tarefas agendadas (name, mode `script`/`ai`, steps, schedule, enabled) |
| `athena.memory` | Notas de memória (key, text, tags) |
| `athena.credentials` | Perfis de login com `secret` criptografado (AES-GCM) |
| `athena.vault` | Metadados do cofre (salt, iterations, verifier) — nunca a chave |
| `athena.taskHistory` | Últimas 200 execuções (status, summary, error) |

**Passos de uma tarefa `script`:** `navigate` · `fill` · `click` · `screenshot` · `login` (usa perfil do cofre).

**Mensagens internas (`chrome.runtime.sendMessage`):**

| Grupo | Mensagens |
|---|---|
| Cofre | `athena_vault_status` · `athena_vault_create` · `athena_vault_unlock` · `athena_vault_lock` |
| Credenciais | `athena_cred_list` · `athena_cred_save` · `athena_cred_delete` |
| Tarefas | `athena_task_list` · `athena_task_save` · `athena_task_delete` · `athena_task_run_now` · `athena_task_history` |
| Memória | `athena_memory_list` · `athena_memory_save` · `athena_memory_delete` |

**Agendador:** o service worker mantém um alarme `athena-scheduler` (mín. 30s) que
confere `nextRun <= now` para cada tarefa habilitada — o agendamento é por relógio
(`scheduler.js`), não por precisão de alarme.

> ⚠️ **Limitações:** as tarefas só executam com o Chrome aberto (o agendador usa
> `chrome.alarms`). Para rodar **sem janela visível**, ative o **modo segundo plano**
> do Chrome: `chrome://settings/system` → *"Continuar executando aplicativos em
> segundo plano quando o Google Chrome for fechado"* — o processo fica na bandeja e
> as tarefas continuam sendo executadas (há um atalho para essa configuração na
> tela de **⏰ Agendamentos**). Para rodar **mesmo com o Chrome totalmente fechado**,
> instale o **companion nativo** (seção abaixo). Se uma tarefa usar `login` com o
> cofre bloqueado, ela é marcada como *ignorada* até você desbloqueá-lo. Senhas
> nunca são enviadas à IA nem registradas em logs.

## 🔌 Companion nativo — agendar com o Chrome fechado (Camada 2)

O **companion** é um host nativo (Node.js, Windows) que roda em segundo plano,
guarda uma cópia da agenda (`%LOCALAPPDATA%\AthenaWake\schedule.json`) e **abre o
Chrome na hora devida** — a extensão então executa a tarefa normalmente (com
catch-up das que venceram enquanto o Chrome estava fechado).

**Instalação:**

```powershell
# 1) Copie o ID da extensão em chrome://extensions
# 2) No PowerShell, na pasta do repositório:
powershell -ExecutionPolicy Bypass -File native/install.ps1 -ExtensionId <ID>
# 3) Recarregue a extensão → Agendamentos mostra "Companion: instalado e conectado"
```

**Como funciona:** a extensão sincroniza a agenda com o host via **native messaging**
a cada mudança de tarefa; o daemon (iniciado no logon, janela oculta) acorda no
vencimento mais próximo e abre o Chrome. Desinstalar: `native/uninstall.ps1`.

**Segurança:** o host **nunca** vê credenciais — apenas `{id, nome, timestamp}` e o
caminho do Chrome; os dados ficam no perfil do usuário e o host valida que o
processo pai é `chrome.exe`. Requer Node.js 22 (ou empacotar `athena-wake.js` em um
exe único com `nexe` para distribuição sem runtime).

## 🛡️ Segurança e privacidade

A extensão foi projetada com **privacidade por padrão**: sem telemetria, sem coleta
em segundo plano e sem comunicação com servidores de terceiros sem uma ação sua.
Consulte também a [Política de Privacidade](POLITICA-DE-PRIVACIDADE.md) completa.

### Como os dados fluem

| Dado | Quando | Para onde vai |
|---|---|---|
| **Prompt do usuário** | Você digita um comando na linha de comando | Direto para o **provedor de IA** que você configurou (HTTPS) |
| **Conteúdo da página** (título/texto/HTML) | Somente se o seu comando exigir e a IA decidir usar a ferramenta | Ao provedor de IA, na mesma conversa |
| **Chave de API** | Salva por você nas Configurações | Fica **apenas no `chrome.storage.local`**; é enviada somente ao provedor para autenticar a sua requisição |
| **Comandos estruturados** | Agente externo via servidor ponte | Trafegam **apenas em `localhost`** (HTTP 3001 / WebSocket 9222) |

### Permissões e por quê

| Permissão | Motivo |
|---|---|
| `host_permissions: <all_urls>` | Injetar o botão flutuante e executar comandos na página **que você está visitando** (o provedor de IA é configurável, então o host não pode ser restrito a um domínio) |
| `scripting` | Executar o `content.js` sob demanda (atalho `Alt+Shift+A` e comandos da IA) |
| `storage` | Guardar localmente chave de API, tarefas agendadas, memória e credenciais **criptografadas** |
| `alarms` · `tabGroups` | Agendar tarefas (heartbeat de 30s) e organizar as abas criadas pela IA |
| `notifications` | Avisar o resultado das tarefas agendadas (concluída/ignorada/falhou) |
| `nativeMessaging` | Sincronizar a agenda com o **companion nativo** (opcional) para executar tarefas com o Chrome fechado |

### O que a extensão **NÃO** faz

- ❌ Não coleta histórico, dados de formulários, cookies nem localização
- ❌ Não tem telemetria, analytics ou anúncios
- ❌ Não envia nada para servidores de terceiros sem o seu comando
- ❌ Não executa ações sozinha — a IA só age **depois** que você digita o comando
- ❌ Não contém código remoto (tudo é estático, exigência do Manifest V3)

### Boas práticas ao usar

- 🔑 **Chave de API**: guarde com cuidado — quem tiver acesso a ela pode usá-la no
  seu provedor. Remova com o botão **Limpar** nas Configurações quando necessário.
- 🖥️ **Servidor ponte**: escuta apenas em `localhost` e **não deve ser exposto
  publicamente** sem autenticação e HTTPS (use só na sua máquina ou em rede interna).
- 🤖 **Agente externo**: ao conectar agentes via MCP/HTTP, use apenas agentes em que
  você confia — eles recebem as mesmas capacidades de controle do navegador.
- ⚡ **Ferramenta `evaluate`**: executa JavaScript na página **somente** quando um
  comando pede; use com moderação em páginas sensíveis.
- 🔐 **Cofre de credenciais**: senhas de sites ficam **criptografadas** (AES-GCM 256)
  com chave derivada de uma **senha-mestre** (PBKDF2) que nunca é armazenada — o
  cofre bloqueia ao reiniciar o Chrome e não há recuperação em caso de perda.

## ❓ Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Popup mostra **"Desconectado"** | Servidor ponte não está rodando | Rode `npm start` na pasta `server/` e clique em **Reconectar** |
| Painel avisa para **configurar a chave de API** | Nenhuma chave salva | Abra **⚙️ Configurações**, salve a chave e clique em **Testar conexão** |
| Botão flutuante não aparece | Página restrita do Chrome | O content script não roda em `chrome://`, na Chrome Web Store etc. — use `Alt+Shift+A` em páginas comuns |
| Erro `IA HTTP 401` | Chave inválida ou expirada | Atualize a chave nas Configurações |
| `Timeout aguardando resposta da extensão` | Extensão não carregada ou aba sem resposta | Recarregue a extensão em `chrome://extensions` e tente novamente |
| Tarefa agendada **não roda** | Chrome fechado no horário ou cofre bloqueado (passo `login`) | Deixe o Chrome aberto; desbloqueie o cofre em **⏰ Agendamentos** |
| Cofre **bloqueado** | Service worker reiniciado | Desbloqueie com a senha-mestre (não há recuperação em caso de perda) |

## 🧪 Testes

Os módulos de lógica pura têm testes com `node:test` (sem dependências):

```bash
cd extension
npm test   # 15 testes: scheduler (recorrência/nextRun) + vault (AES-GCM/PBKDF2)
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Abra uma *issue* para bugs/sugestões ou um *pull request* com sua melhoria. Mantenha o padrão do projeto: código em inglês para identificadores e comentários, textos de interface em português brasileiro.
