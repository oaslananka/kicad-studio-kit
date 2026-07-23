import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([
  "coverage",
  "dist",
  "node_modules",
  "out",
  "site",
]);

const IMPORT_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/gu,
  /\bimport\s*["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
];

function comparePaths(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function walkTypeScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTypeScriptFiles(absolutePath));
      continue;
    }
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(absolutePath);
    }
  }
  return files;
}

export function extractRelativeImportSpecifiers(source) {
  const specifiers = [];
  const seen = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];
      if (!specifier?.startsWith(".") || seen.has(specifier)) {
        continue;
      }
      seen.add(specifier);
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function importCandidates(importer, specifier) {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const extension = path.extname(unresolved);
  const candidates = [];

  if (SOURCE_EXTENSIONS.has(extension)) {
    candidates.push(unresolved);
  } else if (extension === ".js" || extension === ".jsx") {
    const withoutExtension = unresolved.slice(0, -extension.length);
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`);
  } else {
    candidates.push(`${unresolved}.ts`, `${unresolved}.tsx`);
  }
  candidates.push(
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  );
  return candidates;
}

function resolveRelativeImport(importer, specifier, knownFiles) {
  return importCandidates(importer, specifier).find((candidate) =>
    knownFiles.has(path.resolve(candidate)),
  );
}

export function buildTypeScriptImportGraph(rootDirectory) {
  const absoluteRoot = path.resolve(rootDirectory);
  if (
    !fs.existsSync(absoluteRoot) ||
    !fs.statSync(absoluteRoot).isDirectory()
  ) {
    throw new Error(`TypeScript source root is missing: ${absoluteRoot}`);
  }

  const files = walkTypeScriptFiles(absoluteRoot).map((file) =>
    path.resolve(file),
  );
  const knownFiles = new Set(files);
  const graph = new Map();

  for (const file of files.toSorted(comparePaths)) {
    const relativeFile = toPosix(path.relative(absoluteRoot, file));
    const dependencies = new Set();
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of extractRelativeImportSpecifiers(source)) {
      const resolved = resolveRelativeImport(file, specifier, knownFiles);
      if (resolved) {
        dependencies.add(toPosix(path.relative(absoluteRoot, resolved)));
      }
    }
    graph.set(relativeFile, dependencies);
  }
  return graph;
}

export function findImportCycles(graph) {
  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];

  function visit(node) {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!graph.has(dependency)) {
        continue;
      }
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node), lowLinks.get(dependency)),
        );
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node), indices.get(dependency)),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) {
      return;
    }

    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);

    const selfCycle =
      component.length === 1 && graph.get(component[0])?.has(component[0]);
    if (component.length > 1 || selfCycle) {
      const sortedComponent = component.toSorted(comparePaths);
      cycles.push(sortedComponent);
    }
  }

  const sortedNodes = [...graph.keys()].toSorted(comparePaths);
  for (const node of sortedNodes) {
    if (!indices.has(node)) {
      visit(node);
    }
  }

  return cycles.toSorted((left, right) => comparePaths(left[0], right[0]));
}
