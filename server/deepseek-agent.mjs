// ====================================================================
// Athena Chrome Bridge — Agente DeepSeek (function calling)
// Usa a API do DeepSeek para decidir e executar comandos no navegador.
//
// Uso:
//   $env:DEEPSEEK_API_KEY = "sk-..."
//   node deepseek-agent.mjs "abra o google e leia o titulo da pagina"
// ====================================================================
const BRIDGE = 'http://localhost:3001/api/command';
const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const TOOLS = [
  { type: 'function', function: { name: 'navigate', description: 'Navega a aba ativa para uma URL (e a agrupa)', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL completa' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'open_tab', description: 'Abre uma nova aba no grupo Athena e navega para uma URL', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL completa' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'read_page', description: 'Lê título, URL e texto da página ativa', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_page_text', description: 'Texto bruto da página ativa', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'find', description: 'Busca elementos por seletor CSS', parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } } },
  { type: 'function', function: { name: 'click', description: 'Clica num elemento', parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } } },
  { type: 'function', function: { name: 'fill', description: 'Preenche um campo', parameters: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } } },
  { type: 'function', function: { name: 'evaluate', description: 'Executa JavaScript na página', parameters: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } } },
  { type: 'function', function: { name: 'screenshot', description: 'Screenshot da aba ativa', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_tabs', description: 'Lista as abas abertas', parameters: { type: 'object', properties: {} } } },
];

const CMD_MAP = {
  navigate: (a) => ({ type: 'navigate', url: a.url }),
  open_tab: (a) => ({ type: 'open_tab', url: a.url }),
  read_page: () => ({ type: 'read_page' }),
  get_page_text: () => ({ type: 'get_page_text' }),
  find: (a) => ({ type: 'find', selector: a.selector }),
  click: (a) => ({ type: 'click', selector: a.selector }),
  fill: (a) => ({ type: 'fill', selector: a.selector, value: a.value }),
  evaluate: (a) => ({ type: 'evaluate', script: a.script }),
  screenshot: () => ({ type: 'screenshot' }),
  list_tabs: () => ({ type: 'list_tabs' }),
};

async function execTool(name, args) {
  const maker = CMD_MAP[name];
  if (!maker) return { ok: false, error: 'Ferramenta desconhecida: ' + name };
  try {
    const res = await fetch(BRIDGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(maker(args || {})),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function chat(messages) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }),
  });
  if (!res.ok) throw new Error('DeepSeek HTTP ' + res.status + ': ' + (await res.text()));
  return res.json();
}

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) {
    console.error('Uso: node deepseek-agent.mjs "sua instrução para controlar o navegador"');
    process.exit(1);
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('Defina a variável DEEPSEEK_API_KEY antes de rodar.');
    process.exit(1);
  }

  const messages = [{ role: 'user', content: prompt }];

  for (let i = 0; i < 12; i++) {
    const data = await chat(messages);
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Resposta inesperada da DeepSeek');

    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        console.log(`\n🔧 ${tc.function.name}(${tc.function.arguments})`);
        const result = await execTool(tc.function.name, args);
        console.log(`   ↳ ${JSON.stringify(result).slice(0, 300)}`);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    } else {
      console.log('\n🦉 Resposta final:\n' + (msg.content || '(sem conteúdo)'));
      return;
    }
  }
  console.log('\n⚠️ Limite de iterações atingido.');
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
