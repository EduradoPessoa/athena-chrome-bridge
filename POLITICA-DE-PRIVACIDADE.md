# Política de Privacidade — Athena Chrome Bridge

**Última atualização:** 17 de agosto de 2026

Esta política descreve como a extensão **Athena Chrome Bridge** ("extensão") coleta,
usa e armazena informações. A extensão foi projetada para ser **privada por padrão**:
ela não coleta dados em segundo plano, não tem telemetria e não se comunica com
servidores de terceiros sem a ação explícita do usuário.

---

## 1. O que a extensão faz

A extensão permite que o usuário:

- acione um **botão flutuante** em qualquer página e digite comandos em linguagem
  natural para uma IA (provedor OpenAI-compatible configurado pelo usuário);
- leia e interaja com a página ativa (navegar, clicar, preencher formulários, ler
  texto, executar JavaScript) **somente após o usuário solicitar**;
- conecte-se, opcionalmente, a um servidor ponte local (`localhost`) para que
  agentes de IA externos controlem o navegador.

## 2. Dados coletados e processados

| Dado | Quando | Onde fica / para onde vai |
|---|---|---|
| **Prompt do usuário** | Quando o usuário digita um comando na linha de comando | Enviado diretamente da extensão para o **provedor de IA** configurado (ex.: DeepSeek), via HTTPS |
| **Conteúdo da página** (título, texto, HTML) | Somente quando o comando do usuário exige (ex.: "leia a página") e a IA decide usar a ferramenta correspondente | Enviado ao provedor de IA na mesma conversa |
| **Chave de API** | Armazenada quando o usuário salva nas Configurações | **Apenas no `chrome.storage.local`** do navegador; enviada somente ao provedor de IA para autenticar a requisição do usuário |
| **Credenciais de sites** (usuário/senha de perfis de login) | Quando o usuário cria perfis de login em **Agendamentos** | **Criptografadas (AES-GCM 256)** com chave derivada de uma senha-mestre (PBKDF2) que **nunca é armazenada** — a chave fica só em memória e o cofre bloqueia ao reiniciar o Chrome. Usadas exclusivamente para preencher formulários de login em passos determinísticos; **nunca** são enviadas à IA nem registradas em logs |
| **Comandos estruturados** (navegar, clicar etc.) | Quando um agente externo usa o servidor ponte local | Trafegam apenas entre o servidor local (`localhost:3001/9222`) e a extensão; não saem da máquina |

**A extensão NÃO coleta, em nenhuma circunstância:** histórico de navegação, dados
de formulários fora do que o usuário pedir, cookies, identificadores de rastreamento,
localização ou qualquer dado em segundo plano.

## 3. Permissões solicitadas

| Permissão | Motivo |
|---|---|
| `host_permissions: <all_urls>` | Injetar o botão flutuante e ler/controlar a página **que o usuário está visitando** sob demanda |
| `tabs`, `activeTab`, `scripting` | Listar/ativar abas e executar comandos na página ativa solicitados pelo usuário |
| `storage` | Guardar a chave de API e o status de conexão localmente |
| `alarms`, `tabGroups` | Manter a conexão WebSocket viva e organizar as abas criadas pela IA |

Nenhuma permissão é usada para monitoramento: tudo é acionado por uma ação explícita
do usuário ou do agente que ele mesmo configurou.

## 4. Compartilhamento com terceiros

- **Provedor de IA:** o prompt e o contexto da página são enviados ao provedor
  escolhido pelo usuário (configurável), apenas no momento do comando. A política de
  dados do provedor se aplica a essas requisições.
- **Nenhuma outra entidade** recebe dados da extensão. Não há anúncios, analytics,
  venda ou transferência de dados pessoais.

## 5. Armazenamento e retenção

- A chave de API permanece no `chrome.storage.local` até o usuário removê-la
  (botão **Limpar** nas Configurações).
- Credenciais de sites (Agendamentos) ficam **criptografadas** no
  `chrome.storage.local`; a senha-mestre do cofre nunca é armazenada e o cofre
  bloqueia ao reiniciar o navegador. Em caso de perda da senha-mestre, não há
  recuperação — o usuário pode resetar o cofre (removendo as credenciais).
- O histórico de conversa do painel flutuante é **volátil** (mantido apenas em
  memória na página aberta) e desaparece ao fechar/atualizar a aba.
- A extensão não mantém servidores próprios e não armazena dados do usuário em
  nenhum lugar fora do navegador.

## 6. Segurança

- As chamadas à IA usam HTTPS e autenticação por `Bearer` com a chave do usuário.
- O servidor ponte opcional escuta apenas em `localhost` — o usuário deve evitar
  expô-lo publicamente.
- Não há código remoto: todo o código da extensão é estático (Manifest V3).
- **Companion nativo (opcional):** quando instalado, armazena **apenas** timestamps
  de tarefas agendadas (`{id, nome, hora}`) em `%LOCALAPPDATA%\AthenaWake` e abre o
  Chrome na hora devida. **Nenhuma credencial, conteúdo de página ou chave de API
  é enviado ao companion.**

## 7. Alterações nesta política

Alterações materiais serão refletidas nesta página, com nova data de atualização.
O uso continuado da extensão após alterações implica aceitação da política vigente.

## 8. Contato

Dúvidas sobre esta política ou sobre o tratamento de dados: **eduardo@phoenyx.com.br**
(ou abra uma *issue* no repositório público do projeto).
