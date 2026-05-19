let configuration: Record<string, unknown> = {};
const diagnosticStore = new Map<string, Diagnostic[]>();

export function __setConfiguration(next: Record<string, unknown>): void {
  configuration = next;
}

function createDisposable() {
  return {
    dispose: jest.fn()
  };
}

function createMemento() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T =>
      store.has(key) ? (store.get(key) as T) : (fallback as T),
    update: jest.fn(async (key: string, value: unknown) => {
      if (typeof value === 'undefined') {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }),
    keys: () => [...store.keys()]
  };
}

export function createExtensionContextMock() {
  const workspaceState = createMemento();
  const globalState = createMemento();
  const secretsStore = new Map<string, string>();
  return {
    extensionUri: Uri.file('/extension'),
    extension: {
      packageJSON: {
        name: 'kicadstudio',
        version: '2.8.1'
      }
    },
    subscriptions: [] as Array<{ dispose(): void }>,
    workspaceState,
    globalState,
    secrets: {
      get: jest.fn(async (key: string) => secretsStore.get(key)),
      store: jest.fn(async (key: string, value: string) => {
        secretsStore.set(key, value);
      }),
      delete: jest.fn(async (key: string) => {
        secretsStore.delete(key);
      })
    }
  };
}

export const workspace = {
  workspaceFolders: [
    {
      uri: {
        fsPath: process.cwd()
      }
    }
  ],
  isTrusted: true,
  getConfiguration: () => ({
    get: <T>(key: string, fallback?: T): T =>
      Object.prototype.hasOwnProperty.call(configuration, key)
        ? (configuration[key] as T)
        : (fallback as T),
    inspect: <T>(
      key: string
    ):
      | {
          globalValue?: T;
          workspaceValue?: T;
          workspaceFolderValue?: T;
        }
      | undefined =>
      Object.prototype.hasOwnProperty.call(configuration, key)
        ? { globalValue: configuration[key] as T }
        : undefined,
    update: jest.fn()
  }),
  fs: {
    readFile: jest.fn(),
    stat: jest.fn(),
    writeFile: jest.fn()
  },
  onDidSaveTextDocument: jest.fn(() => createDisposable()),
  onDidChangeTextDocument: jest.fn(() => createDisposable()),
  onDidOpenTextDocument: jest.fn(() => createDisposable()),
  onDidCloseTextDocument: jest.fn(() => createDisposable()),
  onDidChangeConfiguration: jest.fn(() => createDisposable()),
  onDidGrantWorkspaceTrust: jest.fn(() => createDisposable()),
  getWorkspaceFolder: () => ({
    uri: {
      fsPath: process.cwd()
    }
  }),
  findFiles: jest.fn().mockResolvedValue([]),
  openTextDocument: jest.fn()
};

export const window = {
  showWarningMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showQuickPick: jest.fn(),
  showOpenDialog: jest.fn(),
  showInputBox: jest.fn(),
  showSaveDialog: jest.fn(),
  showTextDocument: jest.fn(),
  withProgress: jest.fn(async (_options, task) =>
    task({ report: jest.fn() }, { onCancellationRequested: jest.fn() })
  ),
  activeTextEditor: undefined,
  tabGroups: {
    activeTabGroup: {
      activeTab: undefined
    },
    onDidChangeTabs: jest.fn(() => createDisposable())
  },
  createOutputChannel: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
    appendLine: jest.fn()
  })),
  createStatusBarItem: jest.fn(() => ({
    text: '',
    tooltip: '',
    command: undefined,
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn()
  })),
  createWebviewPanel: jest.fn(),
  createQuickPick: jest.fn(() => ({
    items: [],
    selectedItems: [],
    placeholder: '',
    matchOnDescription: false,
    matchOnDetail: false,
    onDidChangeValue: jest.fn(() => createDisposable()),
    onDidAccept: jest.fn(() => createDisposable()),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn()
  })),
  onDidChangeActiveTextEditor: jest.fn(() => createDisposable()),
  onDidChangeTextEditorSelection: jest.fn(() => createDisposable()),
  onDidChangeActiveColorTheme: jest.fn(() => createDisposable())
};

export const languages = {
  getDiagnostics: jest.fn((uri?: Uri) =>
    uri ? (diagnosticStore.get(uri.toString()) ?? []) : []
  ),
  createDiagnosticCollection: jest.fn(() => ({
    set: jest.fn((uri: Uri, diagnostics: Diagnostic[]) => {
      diagnosticStore.set(uri.toString(), diagnostics);
    }),
    delete: jest.fn((uri: Uri) => {
      diagnosticStore.delete(uri.toString());
    }),
    dispose: jest.fn()
  })),
  registerCodeActionsProvider: jest.fn(() => createDisposable())
};

export const commands = {
  executeCommand: jest.fn(),
  registerCommand: jest.fn(() => createDisposable())
};

export const lm = {
  registerTool: jest.fn(() => createDisposable()),
  registerMcpServerDefinitionProvider: jest.fn(() => createDisposable()),
  registerLanguageModelChatProvider: jest.fn(() => createDisposable())
};

export const tasks = {
  registerTaskProvider: jest.fn(() => createDisposable()),
  executeTask: jest.fn()
};

export const env = {
  clipboard: {
    writeText: jest.fn()
  },
  openExternal: jest.fn()
};

export const ProgressLocation = {
  Notification: 1
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2
};

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3
};

export const SymbolKind = {
  Object: 1,
  Field: 2,
  Module: 3,
  Property: 4,
  String: 5
};

export const CompletionItemKind = {
  Keyword: 14
};

export const CodeActionKind = {
  QuickFix: {
    value: 'quickfix',
    append(segment: string) {
      return {
        value: `quickfix.${segment}`,
        append(next: string) {
          return {
            value: `quickfix.${segment}.${next}`,
            append: this.append
          };
        }
      };
    }
  }
};

export const TaskScope = {
  Workspace: 1
};

export const TextEditorRevealType = {
  InCenter: 1
};

export const ViewColumn = {
  Active: 1,
  Beside: 2
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2
};

export const ColorThemeKind = {
  Dark: 2,
  HighContrast: 3
};

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

export class Selection extends Range {
  get active(): Position {
    return this.end;
  }
}

export class Uri {
  constructor(
    public readonly fsPath: string,
    public readonly fragment = ''
  ) {}

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  static joinPath(base: Uri, ...paths: string[]): Uri {
    return new Uri([base.fsPath, ...paths].join('/'));
  }

  static parse(value: string): Uri {
    return new Uri(value);
  }

  with(change: { fragment?: string }): Uri {
    return new Uri(this.fsPath, change.fragment ?? this.fragment);
  }

  toString(): string {
    return this.fragment ? `${this.fsPath}#${this.fragment}` : this.fsPath;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class MarkdownString {
  constructor(public readonly value: string) {}
}

export class TreeItem {
  description?: string;
  tooltip?: string;
  contextValue?: string;
  iconPath?: unknown;
  command?: unknown;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: number
  ) {}
}

export class TabInputCustom {
  constructor(
    public readonly uri: Uri,
    public readonly viewType: string
  ) {}
}

export class Diagnostic {
  source?: string;
  code?: string;

  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: number
  ) {}
}

export class CompletionItem {
  detail?: string;
  insertText?: string;
  range?: Range;

  constructor(
    public readonly label: string,
    public readonly kind: number
  ) {}
}

export class CodeAction {
  command?: unknown;
  isPreferred?: boolean;

  constructor(
    public readonly title: string,
    public readonly kind: unknown
  ) {}
}

export class DocumentSymbol {
  constructor(
    public readonly name: string,
    public readonly detail: string,
    public readonly kind: number,
    public readonly range: Range,
    public readonly selectionRange: Range
  ) {}
}

export class EventEmitter<T> {
  readonly event = jest.fn();

  fire(_value: T): void {}
  dispose(): void {}
}

export class ProcessExecution {
  constructor(
    public readonly process: string,
    public readonly args: string[]
  ) {}
}

export class Task {
  constructor(
    public readonly definition: unknown,
    public readonly scope: number,
    public readonly name: string,
    public readonly source: string,
    public readonly execution: ProcessExecution
  ) {}
}

export class LanguageModelTextPart {
  constructor(public readonly value: string) {}
}

export class LanguageModelToolResult {
  constructor(public readonly content: unknown[]) {}
}

export class McpStdioServerDefinition {
  constructor(public readonly value: unknown) {}
}
