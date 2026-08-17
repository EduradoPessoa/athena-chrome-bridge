// ====================================================================
// Athena Chrome Bridge — servidor MCP (stdio)
// Expõe o controle do navegador como ferramentas MCP para qualquer
// cliente compatível (DeepSeek, Claude Code, Cursor, etc.).
//
// Uso: node mcp.mjs   (registrar como MCP server)
// ====================================================================
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BRIDGE = 'http://localhost:3001/api/command';

async function command(cmd) {
  try {
    const res = await fetch(BRIDGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const json = await res.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(json, null, 2) }],
      isError: json.ok === false,
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: 'Erro ao falar com a ponte: ' + e.message }],
      isError: true,
    };
  }
}

const server = new McpServer({ name: 'athena-chrome', version: '1.0.0' });

server.tool('navigate', 'Navega a aba ativa para uma URL (e a agrupa)', { url: z.string().describe('URL completa, ex.: https://exemplo.com') }, (a) =>
  command({ type: 'navigate', url: a.url }),
);

server.tool('open_tab', 'Abre uma nova aba no grupo Athena e navega para uma URL', { url: z.string().describe('URL completa') }, (a) =>
  command({ type: 'open_tab', url: a.url }),
);

server.tool('list_tabs', 'Lista as abas abertas do navegador', {}, () =>
  command({ type: 'list_tabs' }),
);

server.tool('activate_tab', 'Ativa uma aba pelo id', { tabId: z.number().describe('id da aba') }, (a) =>
  command({ type: 'activate_tab', tabId: a.tabId }),
);

server.tool('read_page', 'Lê título, URL e texto visível da página ativa', {}, () =>
  command({ type: 'read_page' }),
);

server.tool('get_page_text', 'Retorna o texto bruto (innerText) da página ativa', {}, () =>
  command({ type: 'get_page_text' }),
);

server.tool('get_html', 'Retorna o HTML da página ativa (truncado em 200KB)', {}, () =>
  command({ type: 'get_html' }),
);

server.tool('find', 'Busca elementos na página por seletor CSS', { selector: z.string().describe('Seletor CSS, ex.: a.btn, button, #id') }, (a) =>
  command({ type: 'find', selector: a.selector }),
);

server.tool('click', 'Clica num elemento da página', { selector: z.string().describe('Seletor CSS do elemento') }, (a) =>
  command({ type: 'click', selector: a.selector }),
);

server.tool('fill', 'Preenche um campo da página', {
  selector: z.string().describe('Seletor CSS do campo'),
  value: z.string().describe('Valor a preencher'),
}, (a) => command({ type: 'fill', selector: a.selector, value: a.value }));

server.tool('evaluate', 'Executa JavaScript na página ativa', { script: z.string().describe('Expressão JavaScript') }, (a) =>
  command({ type: 'evaluate', script: a.script }),
);

server.tool('screenshot', 'Captura screenshot da aba ativa (PNG em dataURL)', {}, () =>
  command({ type: 'screenshot' }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
