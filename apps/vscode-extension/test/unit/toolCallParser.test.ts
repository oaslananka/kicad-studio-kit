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

  it('parses arrays and ignores invalid entries', () => {
    const calls = extractMcpToolCalls(`
\`\`\`mcp
[
  {"name":"tool_one","arguments":{"a":1}},
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

  it('returns an empty list for malformed blocks or missing blocks', () => {
    expect(extractMcpToolCalls('plain markdown only')).toEqual([]);
    expect(
      extractMcpToolCalls(`
\`\`\`mcp
{not valid json}
\`\`\`
`)
    ).toEqual([]);
  });
});
