/**
 * Servidor MCP de mentira, para las pruebas.
 *
 * Habla el protocolo de verdad por stdio, así que el cliente MCP que se prueba
 * es el mismo código que corre en producción. Publica dos herramientas: una que
 * responde bien y otra que falla a propósito.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const servidor = new McpServer({ name: 'archivador-de-prueba', version: '1.0.0' });

servidor.registerTool(
  'buscar_nota',
  {
    description: 'Busca una nota del archivador por su título.',
    inputSchema: { titulo: z.string().describe('Título o parte del título') },
  },
  async ({ titulo }) => ({
    content: [{ type: 'text', text: 'Nota "' + titulo + '": el conector de Drive va en la Fase 4.' }],
  }),
);

servidor.registerTool(
  'romper',
  { description: 'Falla siempre. Sirve para probar el camino del error.', inputSchema: {} },
  async () => ({ content: [{ type: 'text', text: 'el archivador está cerrado' }], isError: true }),
);

await servidor.connect(new StdioServerTransport());
