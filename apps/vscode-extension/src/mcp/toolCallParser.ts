import type { McpToolCall } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractMcpToolCalls(markdown: string): McpToolCall[] {
  const matches = [...markdown.matchAll(/```mcp\s*([\s\S]*?)```/gi)];
  const toolCalls: McpToolCall[] = [];

  for (const match of matches) {
    const source = match[1]!;
    try {
      const parsed = JSON.parse(source) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        if (!isRecord(value)) {
          continue;
        }
        if (typeof value['name'] !== 'string') {
          continue;
        }
        const argumentsValue = value['arguments'];
        toolCalls.push({
          name: value['name'],
          arguments: isRecord(argumentsValue) ? argumentsValue : {},
          ...(typeof value['preview'] === 'string'
            ? { preview: value['preview'] }
            : {})
        });
      }
    } catch {
      // Malformed MCP blocks are intentionally ignored so surrounding markdown
      // remains renderable and later valid blocks can still be processed.
    }
  }

  return toolCalls;
}
