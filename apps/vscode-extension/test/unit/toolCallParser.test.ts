import { extractMcpToolCalls } from '../../src/mcp/toolCallParser';

describe('extractMcpToolCalls', () => {
  it('parses a single MCP tool call block', () => {
    const calls = extractMcpToolCalls(`
Text before
\`\`\`mcp
{"name":"project_set_design_intent","arguments":{"fabricationProfile":"jlcpcb"},"preview":"Update fabrication profile"}
\`\`\`
`);

    expect(calls).toEqual([
      {
        name: 'project_set_design_intent',
        arguments: { fabricationProfile: 'jlcpcb' },
        preview: 'Update fabrication profile'
      }
    ]);
  });

  it('accepts a block without whitespace after the mcp fence', () => {
    expect(
      extractMcpToolCalls('```mcp{"name":"compact","arguments":{"value":1}}```')
    ).toEqual([{ name: 'compact', arguments: { value: 1 } }]);
  });

  it('parses arrays and preserves valid entries around invalid values', () => {
    const calls = extractMcpToolCalls(`
\`\`\`mcp
[
  {"name":"tool_one","arguments":{"a":1}},
  null,
  {"name":2},
  "skip me",
  {"name":"tool_two","arguments":{}}
]
\`\`\`
`);

    expect(calls).toEqual([
      { name: 'tool_one', arguments: { a: 1 } },
      { name: 'tool_two', arguments: {} }
    ]);
  });

  it('normalizes invalid arguments and preview values', () => {
    const calls = extractMcpToolCalls(`
\`\`\`mcp
[
  {"name":"null_args","arguments":null,"preview":123},
  {"name":"array_args","arguments":[1,2,3]},
  {"name":"string_args","arguments":"invalid"}
]
\`\`\`
`);

    expect(calls).toEqual([
      { name: 'null_args', arguments: {} },
      { name: 'array_args', arguments: {} },
      { name: 'string_args', arguments: {} }
    ]);
  });

  it('returns an empty list for empty, malformed, or missing blocks', () => {
    expect(extractMcpToolCalls('plain markdown only')).toEqual([]);
    expect(extractMcpToolCalls('```mcp   ```')).toEqual([]);
    expect(
      extractMcpToolCalls(`
\`\`\`mcp
{not valid json}
\`\`\`
`)
    ).toEqual([]);
  });
});
