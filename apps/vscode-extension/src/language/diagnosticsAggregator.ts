import * as vscode from 'vscode';

type DiagnosticBucket = 'syntax' | 'drc' | 'erc' | 'other';

export class KiCadDiagnosticsAggregator implements vscode.DiagnosticCollection {
  private readonly buckets = new Map<
    string,
    Map<DiagnosticBucket, readonly vscode.Diagnostic[]>
  >();

  constructor(private readonly backing: vscode.DiagnosticCollection) {}

  get name(): string {
    return this.backing.name;
  }

  set(
    uri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[] | undefined
  ): void;
  set(
    entries: ReadonlyArray<
      [vscode.Uri, readonly vscode.Diagnostic[] | undefined]
    >
  ): void;
  set(
    uriOrEntries:
      | vscode.Uri
      | ReadonlyArray<[vscode.Uri, readonly vscode.Diagnostic[] | undefined]>,
    diagnostics?: readonly vscode.Diagnostic[] | undefined
  ): void {
    if (Array.isArray(uriOrEntries)) {
      for (const [uri, entryDiagnostics] of uriOrEntries) {
        this.set(uri, entryDiagnostics);
      }
      return;
    }

    const uri = uriOrEntries as vscode.Uri;
    if (!diagnostics) {
      this.delete(uri);
      return;
    }

    const key = uri.toString();
    const bucket = inferBucket(uri, diagnostics);
    const current =
      this.buckets.get(key) ??
      new Map<DiagnosticBucket, readonly vscode.Diagnostic[]>();
    current.set(bucket, diagnostics);
    this.buckets.set(key, current);
    this.flush(uri);
  }

  delete(uri: vscode.Uri): void {
    this.buckets.delete(uri.toString());
    this.backing.delete(uri);
  }

  clear(): void {
    this.buckets.clear();
    this.backing.clear();
  }

  forEach(
    callback: (
      uri: vscode.Uri,
      diagnostics: readonly vscode.Diagnostic[],
      collection: vscode.DiagnosticCollection
    ) => unknown,
    thisArg?: unknown
  ): void {
    this.backing.forEach((uri, diagnostics) =>
      callback.call(thisArg, uri, diagnostics, this)
    );
  }

  get(uri: vscode.Uri): readonly vscode.Diagnostic[] | undefined {
    const buckets = this.buckets.get(uri.toString());
    return buckets ? flattenBuckets(buckets) : undefined;
  }

  has(uri: vscode.Uri): boolean {
    return this.buckets.has(uri.toString());
  }

  dispose(): void {
    this.backing.dispose();
  }

  [Symbol.iterator](): Iterator<[vscode.Uri, readonly vscode.Diagnostic[]]> {
    return this.backing[Symbol.iterator]();
  }

  private flush(uri: vscode.Uri): void {
    const buckets = this.buckets.get(uri.toString());
    this.backing.set(uri, buckets ? flattenBuckets(buckets) : undefined);
  }
}

function inferBucket(
  uri: vscode.Uri,
  diagnostics: readonly vscode.Diagnostic[]
): DiagnosticBucket {
  const source =
    diagnostics.find((diagnostic) => diagnostic.source)?.source ?? '';
  if (source.includes('syntax')) {
    return 'syntax';
  }
  if (source.includes('drc')) {
    return 'drc';
  }
  if (source.includes('erc')) {
    return 'erc';
  }
  if (uri.fsPath.endsWith('.kicad_pcb')) {
    return 'drc';
  }
  if (uri.fsPath.endsWith('.kicad_sch')) {
    return 'erc';
  }
  return 'other';
}

function flattenBuckets(
  buckets: Map<DiagnosticBucket, readonly vscode.Diagnostic[]>
): vscode.Diagnostic[] {
  return ['syntax', 'drc', 'erc', 'other'].flatMap((bucket) => [
    ...(buckets.get(bucket as DiagnosticBucket) ?? [])
  ]);
}
