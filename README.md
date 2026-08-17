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

O projeto tem dois componentes que trabalham juntos:

| Componente | Papel |
|---|---|
| `extension/` | Extensão Chrome: injeta o botão flutuante, executa comandos na página e expõe a configuração de chave de API |
| `server/` | Servidor ponte: API HTTP + WebSocket para agentes externos, servidor MCP (stdio) e agente DeepSeek |

---

## ✨ Funcionalidades

- **Botão flutuante com linha de comando** — clique no 🦉 em qualquer página e dê comandos em linguagem natural para a IA (ex.: *"abra o Google e me diga qual é o título da página"*).
- **Chave de API configurável** — a extensão guarda a chave (DeepSeek ou qualquer provedor OpenAI-compatible) no armazenamento local do Chrome; nada sai da sua máquina.
- **11 ferramentas de controle do navegador** — navegar, abrir abas, ler texto/HTML, buscar elementos, clicar, preencher formulários, executar JavaScript e tirar screenshots.
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
│   ├── background.js     # Service worker: WebSocket, comandos e loop da IA
│   ├── content.js        # Executa comandos na página + botão flutuante
│   ├── popup.html/.js    # Popup com status, reconexão e acesso às configurações
│   ├── options.html/.js  # Página de configurações (chave de API)
│   └── icons/            # Ícones da extensão (16/32/48/128)
├── scripts/              # Geração de ícones e empacotamento para a loja
├── POLITICA-DE-PRIVACIDADE.md
├── CHROME-WEB-STORE.md
└── server/               # Servidor ponte
    ├── bridge.js         # API HTTP (3001) + WebSocket (9222)
    ├── mcp.mjs           # Servidor MCP (stdio)
    ├── deepseek-agent.mjs # Agente DeepSeek com function calling
    └── package.json
```

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
| `host_permissions: <all_urls>` | Injetar o botão flutuante e ler/controlar a página **que você está visitando**, sob demanda |
| `tabs` · `activeTab` · `scripting` | Listar/ativar abas e executar os comandos que **você** solicitar |
| `storage` | Guardar a chave de API e o status de conexão **localmente** |
| `alarms` · `tabGroups` | Manter a conexão WebSocket e organizar as abas criadas pela IA |

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

## ❓ Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Popup mostra **"Desconectado"** | Servidor ponte não está rodando | Rode `npm start` na pasta `server/` e clique em **Reconectar** |
| Painel avisa para **configurar a chave de API** | Nenhuma chave salva | Abra **⚙️ Configurações**, salve a chave e clique em **Testar conexão** |
| Botão flutuante não aparece | Página restrita do Chrome | O content script não roda em `chrome://`, na Chrome Web Store etc. — use `Alt+Shift+A` em páginas comuns |
| Erro `IA HTTP 401` | Chave inválida ou expirada | Atualize a chave nas Configurações |
| `Timeout aguardando resposta da extensão` | Extensão não carregada ou aba sem resposta | Recarregue a extensão em `chrome://extensions` e tente novamente |

## 🤝 Contribuindo

Contribuições são bem-vindas! Abra uma *issue* para bugs/sugestões ou um *pull request* com sua melhoria. Mantenha o padrão do projeto: código em inglês para identificadores e comentários, textos de interface em português brasileiro.
