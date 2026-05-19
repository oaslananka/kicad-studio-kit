import * as vscode from 'vscode';

export interface LanguageModelNamespace {
  registerTool?(
    name: string,
    tool: LanguageModelTool<unknown>
  ): vscode.Disposable;
  registerMcpServerDefinitionProvider?(
    id: string,
    provider: McpServerDefinitionProvider<unknown>
  ): vscode.Disposable;
  registerLanguageModelChatProvider?(
    vendor: string,
    provider: LanguageModelChatProvider<LanguageModelChatInformation>
  ): vscode.Disposable;
}

export interface LanguageModelToolInvocationPrepareOptions<TInput> {
  input: TInput;
}

export interface LanguageModelToolInvocationOptions<TInput> {
  input: TInput;
}

export interface LanguageModelToolInvocationResult {
  invocationMessage?: string;
  confirmationMessages?: {
    title?: string;
    message?: unknown;
  };
}

export interface LanguageModelTool<TInput> {
  prepareInvocation?(
    options: LanguageModelToolInvocationPrepareOptions<TInput>,
    token: vscode.CancellationToken
  ):
    | LanguageModelToolInvocationResult
    | undefined
    | Promise<LanguageModelToolInvocationResult | undefined>;
  invoke(
    options: LanguageModelToolInvocationOptions<TInput>,
    token: vscode.CancellationToken
  ): Promise<unknown>;
}

export interface LanguageModelChatInformation {
  id: string;
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  tooltip?: string | undefined;
  detail?: string | undefined;
  capabilities: {
    imageInput?: boolean | undefined;
    toolCalling?: boolean | number | undefined;
  };
}

export interface LanguageModelChatRequestMessage {
  role: unknown;
  content: readonly unknown[];
  name?: string | undefined;
}

export interface LanguageModelChatProvider<
  TModel extends LanguageModelChatInformation
> {
  provideLanguageModelChatInformation(
    options: { silent: boolean },
    token: vscode.CancellationToken
  ): Promise<TModel[]>;
  provideLanguageModelChatResponse(
    model: TModel,
    messages: readonly LanguageModelChatRequestMessage[],
    options: Record<string, unknown>,
    progress: { report(value: unknown): void },
    token: vscode.CancellationToken
  ): Promise<void>;
  provideTokenCount(
    model: TModel,
    text: string | LanguageModelChatRequestMessage,
    token: vscode.CancellationToken
  ): Promise<number>;
}

export interface McpServerDefinitionProvider<TServer> {
  onDidChangeMcpServerDefinitions?: vscode.Event<void>;
  provideMcpServerDefinitions(
    token?: vscode.CancellationToken
  ): Promise<TServer[]>;
  resolveMcpServerDefinition?(
    server: TServer,
    token?: vscode.CancellationToken
  ): Promise<TServer | undefined>;
}

export function getLanguageModelApi(): LanguageModelNamespace | undefined {
  return (vscode as unknown as { lm?: LanguageModelNamespace }).lm;
}

export function createLanguageModelTextPart(value: string): unknown {
  const ctor = (
    vscode as unknown as {
      LanguageModelTextPart?: new (text: string) => unknown;
    }
  ).LanguageModelTextPart;
  return typeof ctor === 'function' ? new ctor(value) : { value };
}

export function createLanguageModelToolResult(parts: unknown[]): unknown {
  const ctor = (
    vscode as unknown as {
      LanguageModelToolResult?: new (parts: unknown[]) => unknown;
    }
  ).LanguageModelToolResult;
  return typeof ctor === 'function' ? new ctor(parts) : { content: parts };
}

export function createMarkdownString(value: string): unknown {
  const ctor = (
    vscode as unknown as { MarkdownString?: new (value: string) => unknown }
  ).MarkdownString;
  return typeof ctor === 'function' ? new ctor(value) : value;
}

export function createMcpStdioServerDefinition(args: {
  label: string;
  command: string;
  args: string[];
  cwd: vscode.Uri;
  env: Record<string, string>;
  version?: string | undefined;
}): unknown | undefined {
  const ctor = (
    vscode as unknown as {
      McpStdioServerDefinition?: new (value: unknown) => unknown;
    }
  ).McpStdioServerDefinition;
  return typeof ctor === 'function' ? new ctor(args) : undefined;
}

export function flattenLanguageModelMessages(
  messages: readonly LanguageModelChatRequestMessage[]
): string {
  return messages
    .map((message) => {
      const label = normalizeRoleLabel(message.role, message.name);
      const content = message.content
        .map((part) => getLanguageModelPartText(part))
        .join('')
        .trim();
      return content ? `${label}: ${content}` : undefined;
    })
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
}

export function estimateLanguageModelTokens(
  value: string | LanguageModelChatRequestMessage
): number {
  const text =
    typeof value === 'string' ? value : flattenLanguageModelMessages([value]);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function getLanguageModelPartText(part: unknown): string {
  if (typeof part === 'string') {
    return part;
  }
  if (!isRecord(part)) {
    return '';
  }
  if (typeof part['value'] === 'string') {
    return part['value'];
  }
  if (typeof part['text'] === 'string') {
    return part['text'];
  }
  return '';
}

function normalizeRoleLabel(role: unknown, name: string | undefined): string {
  if (typeof role === 'string' && role.trim()) {
    return role;
  }
  return name?.trim() ? name : 'message';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
