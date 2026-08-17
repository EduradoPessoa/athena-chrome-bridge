# 🛒 Rascunho de listagem — Chrome Web Store

Modelo pronto para colar no [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
ao criar o item. Ajuste o que for necessário.

---

## Nome (até 75 caracteres)

```
Athena Chrome Bridge — IA que controla seu navegador
```

## Descrição curta (até 132 caracteres)

```
Botão flutuante com linha de comando para IA controlar o Chrome: navegar, clicar, preencher e ler páginas.
```

## Descrição longa (sugestão)

```
🦉 Athena Chrome Bridge coloca um assistente de IA no controle do seu navegador.

Como funciona:
• Clique no botão flutuante (ou use Alt+Shift+A) em qualquer página;
• Digite um comando em linguagem natural — ex.: "abra o Google e me diga qual é o título da página";
• A IA executa as ações no navegador (navegar, abrir abas, ler conteúdo, clicar, preencher formulários, tirar screenshots) e responde no próprio painel.

Recursos:
• Linha de comando flutuante com histórico de conversa;
• Agendamento de tarefas: data, hora e recorrência (diária/semanal/mensal) com contexto, memória e perfis de login criptografados (cofre com senha-mestre);
• Compatível com DeepSeek e qualquer provedor OpenAI-compatible (URL e modelo configuráveis);
• Chave de API guardada apenas no armazenamento local do Chrome — nada sai da sua máquina sem o seu comando;
• Servidor ponte opcional (localhost) para integrar agentes externos via API HTTP ou MCP;
• Atalho de teclado Alt+Shift+A.

Privacidade: sem telemetria, sem coleta em segundo plano. O conteúdo da página é enviado ao provedor de IA somente quando você envia um comando. Política de privacidade: [URL da política].
```

## Categoria

- **Developer Tools** (ou **Productivity**, se preferir)

## Palavras-chave

```
athena, ai, browser automation, controle de navegador, automação, agente, mcp, deepseek, linha de comando, assistente
```

## Screenshots (1280×800 ou 640×400; mínimo 1, ideal 4)

1. Botão flutuante + painel de comando aberto sobre uma página;
2. Conversa com a IA mostrando uma ação executada (ex.: `🔧 navigate …`) e a resposta final;
3. Popup da extensão (status conectado + botões Reconectar/Configurações);
4. Página de Configurações (chave de API, URL e modelo).

## 📋 Permissões e justificativas (aba Privacy do dashboard)

| Permissão | Justificativa |
|---|---|
| `host_permissions: <all_urls>` | Necessária para injetar o botão flutuante e executar comandos na página que o usuário está visitando, sob demanda |
| `tabs` / `activeTab` | Listar e ativar abas quando o usuário (ou o agente que ele configurou) pede |
| `scripting` | Executar os comandos de leitura/interação solicitados pelo usuário |
| `storage` | Salvar a chave de API, tarefas agendadas e credenciais criptografadas localmente |
| `alarms` / `tabGroups` | Agendar tarefas (heartbeat) e organizar as abas criadas pela IA |
| `notifications` | Avisar o usuário sobre o resultado das tarefas agendadas |

## 🔒 Declaração de privacidade (para colar)

> A extensão não coleta dados em segundo plano e não possui telemetria. O usuário
> digita comandos que podem incluir conteúdo da página aberta; esse conteúdo é
> enviado **somente** ao provedor de IA configurado pelo usuário (DeepSeek ou
> OpenAI-compatible) no momento do comando, via HTTPS. A chave de API do usuário
> fica armazenada apenas no chrome.storage.local e é enviada exclusivamente ao
> provedor para autenticação. A conexão com o servidor ponte (opcional) acontece
> apenas em localhost. Nenhum dado é vendido ou compartilhado com terceiros além do
> provedor de IA escolhido. Política completa: [URL da política].

## 🌐 URL da política de privacidade

Hospede a [`POLITICA-DE-PRIVACIDADE.md`](POLITICA-DE-PRIVACIDADE.md) e use uma URL pública:

- **Opção rápida (raw do GitHub):** `https://raw.githubusercontent.com/EduradoPessoa/athena-chrome-bridge/main/POLITICA-DE-PRIVACIDADE.md`
- **Opção estável (GitHub Pages):** publicar o repo em `https://EduradoPessoa.github.io/athena-chrome-bridge/POLITICA-DE-PRIVACIDADE.md` (Settings → Pages → branch `main`, pasta raiz)

## ✅ Checklist antes do envio

- [ ] Rodar `powershell -ExecutionPolicy Bypass -File scripts/empacotar-extension.ps1`
- [ ] Conferir que o zip tem `manifest.json` na raiz
- [ ] Ícones 16/32/48/128 presentes (já declarados no manifest)
- [ ] Política de privacidade acessível publicamente
- [ ] Justificativas de permissão preenchidas
- [ ] Versão do manifest atualizada a cada nova submissão
