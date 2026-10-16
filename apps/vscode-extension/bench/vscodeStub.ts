/**
 * Minimal `vscode` module stand-in for CodSpeed benchmarks.
 *
 * Benchmarks exercise pure, deterministic extension logic outside the VS Code
 * extension host, so only the handful of runtime values those modules touch
 * are provided here.
 */
export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
  ) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

export class Uri {
  constructor(public readonly fsPath: string) {}

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  static joinPath(base: Uri, ...paths: string[]): Uri {
    return new Uri([base.fsPath, ...paths].join('/'));
  }

  toString(): string {
    return this.fsPath;
  }
}

export const workspace = {
  getConfiguration: () => ({
    get: <T>(_key: string, fallback?: T): T | undefined => fallback
  })
};
