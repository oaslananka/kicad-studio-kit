import assert from "node:assert/strict";
import test from "node:test";
import {
  renderDocsSearchContent,
  stripSearchCodeBlocks,
} from "./lib/docs-search-index.mjs";

function markdownRenderer(html, frontmatter = {}) {
  return {
    render(_source, environment) {
      environment.frontmatter = frontmatter;
      return html;
    },
  };
}

test("#531 search rendering honors search:false frontmatter", () => {
  const environment = { relativePath: "faq.md" };
  const result = renderDocsSearchContent(
    "# FAQ",
    environment,
    markdownRenderer("<h1>FAQ</h1>", { search: false }),
  );
  assert.equal(result, "");
});

test("#531 search rendering excludes repository-internal Superpowers records", () => {
  const environment = {
    relativePath: "superpowers/plans/2026-07-23-example.md",
  };
  const result = renderDocsSearchContent(
    "# Internal plan",
    environment,
    markdownRenderer("<h1>Internal plan</h1>"),
  );
  assert.equal(result, "");
});

test("#531 search rendering preserves prose and removes rendered code blocks", () => {
  const html =
    '<h1>Install</h1><p>Run the installer.</p><pre class="shiki"><code>pnpm install</code></pre><h2>Next</h2>';
  assert.equal(
    stripSearchCodeBlocks(html),
    "<h1>Install</h1><p>Run the installer.</p><h2>Next</h2>",
  );
});

test("#531 malformed pre blocks preserve the unparsed remainder", () => {
  const html = "<h1>Install</h1><pre><code>unfinished";
  assert.equal(stripSearchCodeBlocks(html), html);
});
