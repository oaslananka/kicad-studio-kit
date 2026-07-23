export const DOCS_SEARCH_EXCLUDED_PREFIXES = Object.freeze(["superpowers/"]);

export function stripSearchCodeBlocks(html) {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf("<pre", cursor);
    if (start === -1) {
      return result + html.slice(cursor);
    }
    const openingEnd = html.indexOf(">", start + "<pre".length);
    if (openingEnd === -1) {
      return result + html.slice(cursor);
    }
    const end = html.indexOf("</pre>", openingEnd + 1);
    if (end === -1) {
      return result + html.slice(cursor);
    }
    result += html.slice(cursor, start);
    cursor = end + "</pre>".length;
  }

  return result;
}

export function renderDocsSearchContent(source, environment, markdownRenderer) {
  const html = markdownRenderer.render(source, environment);
  if (environment.frontmatter?.search === false) {
    return "";
  }

  const relativePath = String(environment.relativePath ?? "").replaceAll(
    "\\",
    "/",
  );
  if (
    DOCS_SEARCH_EXCLUDED_PREFIXES.some((prefix) =>
      relativePath.startsWith(prefix),
    )
  ) {
    return "";
  }

  return stripSearchCodeBlocks(html);
}
