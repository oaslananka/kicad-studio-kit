import type { McpToolCall } from '../types';

export function extractMcpToolCalls(markdown: string): McpToolCall[] {
  const matches = [...markdown.matchAll(/```mcp\s*([\s\S]*?)```/gi)];
  const toolCalls: McpToolCall[] = [];

  for (const match of matches) {
    const source = match[1]?.trim();
    if (!source) {
      continue;
    }
    try {
      const parsed = JSON.parse(source) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        if (typeof value !== 'object' || value === null) {
          continue;
        }
        const record = value as Record<string, unknown>;
        if (typeof record['name'] !== 'string') {
          continue;
        }
        toolCalls.push({
          name: record['name'],
          arguments:
            typeof record['arguments'] === 'object' &&
            record['arguments'] !== null
              ? (record['arguments'] as Record<string, unknown>)
              : {},
          ...(typeof record['preview'] === 'string'
            ? { preview: record['preview'] }
            : {})
        });
      }
    } catch {
      continue;
    }
  }

  return toolCalls;
}
