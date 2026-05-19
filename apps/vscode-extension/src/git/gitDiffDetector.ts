import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { ComponentDiff } from '../types';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import { getWorkspaceRoot, relativeToWorkspace } from '../utils/pathUtils';

const GIT_SHOW_TIMEOUT_MS = 5_000;
const GIT_SHOW_MAX_BUFFER = 5 * 1024 * 1024;

interface DiffComponentRecord {
  [key: string]: string;
  uuid: string;
  reference: string;
  value: string;
  footprint: string;
  libId: string;
}

export class GitDiffDetector {
  constructor(private readonly parser: SExpressionParser) {}

  async getChangedComponents(
    schFile: string,
    fromRef = 'HEAD',
    toRef: 'working' | string = 'working'
  ): Promise<ComponentDiff[]> {
    const workspaceRoot = getWorkspaceRoot(undefined) ?? path.dirname(schFile);
    const relativePath = relativeToWorkspace(schFile, workspaceRoot);
    const beforeText = this.readGitVersion(
      workspaceRoot,
      fromRef,
      relativePath
    );
    const afterText =
      toRef === 'working'
        ? fs.readFileSync(schFile, 'utf8')
        : this.readGitVersion(workspaceRoot, toRef, relativePath);

    const beforeMap = this.extractComponents(beforeText);
    const afterMap = this.extractComponents(afterText);
    const diffs: ComponentDiff[] = [];

    for (const [key, before] of beforeMap) {
      const after = afterMap.get(key);
      if (!after) {
        diffs.push({
          uuid: key,
          reference: before.reference,
          type: 'removed',
          before
        });
        continue;
      }
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({
          uuid: key,
          reference: after.reference,
          type: 'changed',
          before,
          after
        });
      }
    }

    for (const [key, after] of afterMap) {
      if (!beforeMap.has(key)) {
        diffs.push({
          uuid: key,
          reference: after.reference,
          type: 'added',
          after
        });
      }
    }

    return diffs.sort((left, right) =>
      left.reference.localeCompare(right.reference)
    );
  }

  readFileVersions(
    schFile: string,
    fromRef = 'HEAD'
  ): { beforeText: string; afterText: string } {
    const workspaceRoot = getWorkspaceRoot(undefined) ?? path.dirname(schFile);
    const relativePath = relativeToWorkspace(schFile, workspaceRoot);
    return {
      beforeText: this.readGitVersion(workspaceRoot, fromRef, relativePath),
      afterText: fs.readFileSync(schFile, 'utf8')
    };
  }

  private readGitVersion(
    workspaceRoot: string,
    ref: string,
    relativePath: string
  ): string {
    const result = spawnSync('git', ['show', `${ref}:${relativePath}`], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: GIT_SHOW_TIMEOUT_MS,
      maxBuffer: GIT_SHOW_MAX_BUFFER
    });
    if (result.status === 0) {
      return result.stdout;
    }
    if (result.error || result.status === null) {
      const reason =
        result.error instanceof Error
          ? result.error.message
          : result.stderr || 'git show did not complete.';
      throw new Error(`Failed to read ${relativePath} from ${ref}: ${reason}`);
    }
    if (isMissingBlobError(result.stderr)) {
      return '';
    }
    throw new Error(
      `Failed to read ${relativePath} from ${ref}: ${result.stderr || `git exited with ${result.status}`}`
    );
  }

  private extractComponents(text: string): Map<string, DiffComponentRecord> {
    const ast = this.parser.parse(text);
    const nodes = [
      ...this.parser.findAllNodes(ast, 'symbol'),
      ...this.parser.findAllNodes(ast, 'footprint')
    ];
    const map = new Map<string, DiffComponentRecord>();

    for (const node of nodes) {
      const component = this.toComponent(node);
      if (!component.uuid) {
        continue;
      }
      map.set(component.uuid, component);
    }

    return map;
  }

  private toComponent(node: SNode): DiffComponentRecord {
    const reference =
      this.findProperty(node, 'Reference') ??
      this.findProperty(node, 'reference') ??
      '';
    const value =
      this.findProperty(node, 'Value') ??
      this.findProperty(node, 'value') ??
      '';
    const footprint =
      this.findProperty(node, 'Footprint') ??
      this.findProperty(node, 'footprint') ??
      '';
    const libId = this.findProperty(node, 'lib_id') ?? '';
    const uuid = this.findProperty(node, 'uuid') ?? reference;
    return { uuid, reference, value, footprint, libId };
  }

  private findProperty(node: SNode, key: string): string | undefined {
    for (const child of node.children ?? []) {
      if (child.type !== 'list' || !child.children?.length) {
        continue;
      }
      const head = child.children[0];
      if (!head) {
        continue;
      }
      if (String(head.value ?? '') === key && child.children[1]) {
        return String(child.children[1].value ?? '');
      }
      if (
        String(head.value ?? '') === 'property' &&
        String(child.children[1]?.value ?? '') === key
      ) {
        return String(child.children[2]?.value ?? '');
      }
    }
    return undefined;
  }
}

function isMissingBlobError(stderr: string): boolean {
  return (
    /Path .* does not exist in/i.test(stderr) ||
    /exists on disk, but not in/i.test(stderr) ||
    /does not exist in ['"]?[^'"]+['"]?$/i.test(stderr)
  );
}
