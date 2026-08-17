# Athena Chrome Bridge

Extensão **Manifest V3** + **servidor ponte** que permite a um agente de IA ler e
controlar o navegador: navegar, extrair texto, buscar elementos, clicar, preencher
campos, tirar screenshot e executar JavaScript na página.

## 🏗️ Arquitetura

```
Agente de IA ──HTTP──► Servidor Ponte (Node) ──WebSocket──► Extensão (MV3) ──► Página
  (fetch/curl)        localhost:3001/api         localhost:9222   background ─► content script
```

| Componente | Papel |
|---|---|
| `extension/` | Extensão Chrome (background + content script + popup + configurações) |
| `server/bridge.js` | Servidor ponte (WebSocket + API HTTP) |

## 🦉 Botão flutuante + linha de comando para a IA

A extensão injeta em toda página um **botão flutuante** (canto inferior direito,
atalho `Alt+Shift+A`). Ao clicar, abre a **linha de comando** onde você digita um
comando em linguagem natural para a IA, ex.:

```
abra o google e me diga qual é o título da página
```

Fluxo:

```
Botão flutuante (content script)
        │  chrome.runtime.sendMessage({ type: 'athena_command' })
        ▼
Background (service worker) — loop com a API (DeepSeek/OpenAI-compatible)
        │  function calling → executa ferramentas (navigate, click, fill…)
        ▼
Resposta final exibida no painel flutuante
```

- A IA decide e executa as ferramentas diretamente (não depende do servidor ponte).
- A chave de API é salva nas **Configurações** da extensão (`chrome.storage.local`).

## ⚙️ Configurações (chave de API)

No popup, ao lado do botão **Reconectar**, há o botão **⚙️ Configurações**, que abre
a página `options.html` (`chrome-extension://…/options.html`). Lá você informa:

| Campo | Padrão | Descrição |
|---|---|---|
| Chave da API | — | Chave do provedor (DeepSeek ou OpenAI-compatible) |
| URL da API | `https://api.deepseek.com/chat/completions` | Endpoint de chat completions |
| Modelo | `deepseek-chat` | Modelo usado pela linha de comando |

Há botões para **Salvar**, **Testar conexão** (valida a chave) e **Limpar** (remove a chave).

## ▶️ Como rodar

### 1) Servidor ponte

```powershell
cd teste-003-chrome-ext/server
npm install
npm start
```

### 2) Instalar a extensão no Chrome

1. Abra `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação** → selecione a pasta `extension/`
4. O popup deve mostrar **"Conectado ao servidor"**

## 🤖 Comandos disponíveis (via `POST /api/command`)

| Comando | Descrição |
|---|---|
| `{ "type": "navigate", "url": "https://..." }` | Navega em uma aba |
| `{ "type": "list_tabs" }` | Lista abas abertas |
| `{ "type": "activate_tab", "tabId": 123 }` | Ativa uma aba |
| `{ "type": "get_page_text" }` | Texto da página (innerText) |
| `{ "type": "read_page" }` | Título + URL + texto visível |
| `{ "type": "get_html" }` | HTML da página (truncado) |
| `{ "type": "find", "selector": "a.btn" }` | Busca elementos por seletor CSS |
| `{ "type": "click", "selector": "button" }` | Clica num elemento |
| `{ "type": "fill", "selector": "input", "value": "texto" }` | Preenche um campo |
| `{ "type": "evaluate", "script": "document.title" }` | Executa JS na página |
| `{ "type": "screenshot" }` | Screenshot da aba (dataURL PNG) |

## 🧪 Testar

```powershell
# status da conexão
Invoke-RestMethod http://localhost:3001/api/status

# abas abertas
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/command -ContentType 'application/json' -Body '{"type":"list_tabs"}'

# ler a página ativa
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/command -ContentType 'application/json' -Body '{"type":"read_page"}'

# buscar links
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/command -ContentType 'application/json' -Body '{"type":"find","selector":"a"}'
```

## 🤖 Usar com DeepSeek / MCP

### Opção A — Servidor MCP (recomendado)

```powershell
cd teste-003-chrome-ext/server
npm install
node mcp.mjs
```

Registre como MCP no seu cliente (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "athena-chrome": {
      "command": "node",
      "args": ["E:/DEV-NOVO/deepseek-harness/teste-003-chrome-ext/server/mcp.mjs"]
    }
  }
}
```

Ou pelo Claude Code:

```powershell
claude mcp add athena-chrome -- node E:/DEV-NOVO/deepseek-harness/teste-003-chrome-ext/server/mcp.mjs
```

### Opção B — Agente DeepSeek (function calling)

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
node deepseek-agent.mjs "abra o google e leia o título da página"
```

O agente usa a API da DeepSeek (OpenAI-compatible) com *function calling* para decidir
quais comandos executar no navegador, e os executa via a API HTTP da ponte.

## 📝 Notas

- O protocolo (WebSocket entre extensão e ponte + API para o agente) é o mesmo espírito
  do **Claude Chrome** (`claude-in-chrome`). Para virar MCP de verdade, basta expor os
  comandos como ferramentas MCP sobre a mesma API HTTP.
- MV3 com service worker usando WebSocket — funciona no Chrome 116+.
- O content script é idempotente (injeção protegida por flag global), então pode ser
  re-injetado sem duplicar listeners.
