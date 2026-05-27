import * as assert from 'node:assert/strict';
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams
} from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { isMcpVersionSupported } from '../../../src/mcp/compat';
import { MCP_PROTOCOL_VERSION } from '../../../src/mcp/compatibilityMatrix';

const EXTENSION_PACKAGE_NAME = 'kicadstudiokit';

interface JsonRpcEnvelope<T> {
  result?: T;
  error?: {
    message?: string;
    data?: unknown;
  };
}

interface RpcResult<T> {
  json: JsonRpcEnvelope<T>;
  sessionId?: string | undefined;
}

interface InitializeResult {
  serverInfo?: {
    version?: string;
  };
  capabilities?: unknown;
}

export interface RealServerHarness {
  endpoint: string;
  projectDir: string;
  initializeResult: InitializeResult;
  artifactDir: string;
  serverCommand: string;
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined>;
  listTools(): Promise<string[]>;
  readResource(uri: string): Promise<string>;
  teardown(): Promise<void>;
}

export function realServerSkipReason(): string | undefined {
  if (process.env['SKIP_REAL_SERVER']) {
    return 'SKIP_REAL_SERVER is set.';
  }
  if (
    process.env['GITHUB_EVENT_NAME'] === 'pull_request' &&
    process.env['GITHUB_HEAD_REPOSITORY_FORK'] === 'true'
  ) {
    return 'Real-server tests are skipped for pull requests from forks.';
  }
  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' });
  if (uv.error || uv.status !== 0) {
    return 'uv is not available on PATH.';
  }
  if (!fs.existsSync(defaultFixtureProject())) {
    return 'Vendored benchmark fixture is missing.';
  }
  if (!fs.existsSync(localMcpServerProject())) {
    return 'Local packages/mcp-server checkout is missing.';
  }
  return undefined;
}

export async function withRealServer(
  testBody: (harness: RealServerHarness) => Promise<void>
): Promise<void> {
  const skip = realServerSkipReason();
  if (skip) {
    console.log(`[real-server skipped] ${skip}`);
    return;
  }

  const harness = await startRealServer();
  try {
    await testBody(harness);
  } finally {
    await harness.teardown();
  }
}

async function startRealServer(): Promise<RealServerHarness> {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-real-mcp-')
  );
  const artifactDir = resolveArtifactDir(tempRoot);
  fs.mkdirSync(artifactDir, { recursive: true });
  const projectDir = path.join(tempRoot, 'project');
  copyDirectory(defaultFixtureProject(), projectDir);
  const port = await findFreePort();
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const { command, args, cwd } = localServerCommand();
  const serverCommand = [command, ...args].join(' ');
  const server = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      KICAD_MCP_TRANSPORT: 'streamable-http',
      KICAD_MCP_HOST: '127.0.0.1',
      KICAD_MCP_PORT: String(port),
      KICAD_MCP_PROJECT_DIR: projectDir,
      KICAD_MCP_PROFILE: 'full',
      KICAD_MCP_LOG_LEVEL: 'ERROR'
    },
    stdio: 'pipe'
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exited:
    | { code: number | null; signal: NodeJS.Signals | null }
    | undefined;
  server.stdout.on('data', (chunk: Buffer) => {
    stdout.push(chunk.toString('utf8'));
  });
  server.stderr.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString('utf8'));
  });
  server.on('exit', (code, signal) => {
    exited = { code, signal };
  });

  let sessionId: string | undefined;
  let initializeResult: InitializeResult | undefined;
  try {
    initializeResult = await waitForInitialize(
      endpoint,
      () => exited,
      stderr
    ).then(async (result) => {
      sessionId = result.sessionId;
      const initialized = result.json.result ?? {};
      const initializedVersion = initialized.serverInfo?.version ?? '0.0.0';
      const serverCardVersion = isMcpVersionSupported(initializedVersion)
        ? initializedVersion
        : await readWellKnownVersion(endpoint);
      assert.ok(
        isMcpVersionSupported(serverCardVersion ?? '0.0.0'),
        `Unexpected real MCP version ${serverCardVersion ?? initializedVersion}`
      );
      return {
        ...initialized,
        serverInfo: {
          ...initialized.serverInfo,
          version: serverCardVersion ?? initializedVersion
        }
      };
    });
  } catch (error) {
    writeServerArtifacts(artifactDir, {
      command: serverCommand,
      endpoint,
      projectDir,
      stdout,
      stderr,
      error
    });
    await stopServer(server);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
  assert.ok(initializeResult);

  return {
    endpoint,
    projectDir,
    initializeResult,
    artifactDir,
    serverCommand,
    async callTool(name, args) {
      const result = await postJsonRpc<Record<string, unknown>>(
        endpoint,
        'tools/call',
        { name, arguments: args },
        sessionId
      );
      sessionId = result.sessionId ?? sessionId;
      if (result.json.error) {
        throw new Error(result.json.error.message ?? `MCP tool ${name} failed`);
      }
      return result.json.result;
    },
    async listTools() {
      const result = await postJsonRpc<{ tools?: Array<{ name?: string }> }>(
        endpoint,
        'tools/list',
        {},
        sessionId
      );
      sessionId = result.sessionId ?? sessionId;
      if (result.json.error) {
        throw new Error(result.json.error.message ?? 'MCP tools/list failed');
      }
      return (result.json.result?.tools ?? [])
        .map((tool) => tool.name)
        .filter((name): name is string => typeof name === 'string');
    },
    async readResource(uri) {
      const result = await postJsonRpc<{
        contents?: Array<{ text?: string }>;
      }>(endpoint, 'resources/read', { uri }, sessionId);
      sessionId = result.sessionId ?? sessionId;
      if (result.json.error) {
        throw new Error(
          result.json.error.message ?? `MCP resource ${uri} failed`
        );
      }
      return (
        result.json.result?.contents?.find(
          (item) => typeof item.text === 'string'
        )?.text ?? ''
      );
    },
    async teardown() {
      writeServerArtifacts(artifactDir, {
        command: serverCommand,
        endpoint,
        projectDir,
        stdout,
        stderr
      });
      await stopServer(server);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

function localServerCommand(): {
  command: string;
  args: string[];
  cwd: string;
} {
  const project = localMcpServerProject();
  return {
    command: 'uv',
    args: [
      'run',
      '--project',
      project,
      '--all-extras',
      '--frozen',
      'kicad-mcp-pro',
      'serve'
    ],
    cwd: project
  };
}

function localMcpServerProject(): string {
  return path.resolve(extensionRoot(), '..', '..', 'packages', 'mcp-server');
}

function resolveArtifactDir(tempRoot: string): string {
  const configured = process.env['REAL_SERVER_ARTIFACT_DIR'];
  return configured
    ? path.resolve(configured)
    : path.join(tempRoot, 'artifacts');
}

async function readWellKnownVersion(
  endpoint: string
): Promise<string | undefined> {
  const baseEndpoint = endpoint.replace(/\/mcp$/, '');
  for (const path of ['/.well-known/mcp-server', '/well-known/mcp-server']) {
    try {
      const response = await fetch(`${baseEndpoint}${path}`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as unknown;
      if (!isRecord(payload)) {
        continue;
      }
      const serverInfo = isRecord(payload['serverInfo'])
        ? payload['serverInfo']
        : {};
      const version =
        typeof serverInfo['version'] === 'string'
          ? serverInfo['version']
          : typeof payload['version'] === 'string'
            ? payload['version']
            : undefined;
      if (version) {
        return version;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function defaultFixtureProject(): string {
  return path.join(
    extensionRoot(),
    'test',
    'fixtures',
    'benchmark_projects',
    'pass_minimal_mcu_board'
  );
}

function extensionRoot(): string {
  let cursor = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = path.join(cursor, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
          name?: unknown;
        };
        if (parsed.name === EXTENSION_PACKAGE_NAME) {
          return cursor;
        }
      } catch {
        // Keep walking when an intermediate package.json cannot be parsed.
      }
    }
    const next = path.dirname(cursor);
    if (next === cursor) {
      break;
    }
    cursor = next;
  }
  throw new Error(
    `Unable to locate ${EXTENSION_PACKAGE_NAME} package root from ${__dirname}`
  );
}

async function waitForInitialize(
  endpoint: string,
  getExit: () =>
    | { code: number | null; signal: NodeJS.Signals | null }
    | undefined,
  stderr: string[]
): Promise<RpcResult<InitializeResult>> {
  const deadline = Date.now() + 30000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const exit = getExit();
    if (exit) {
      throw new Error(
        `kicad-mcp-pro exited before initialize (${String(exit.code ?? exit.signal)}): ${stderr.join('')}`
      );
    }
    try {
      return await postJsonRpc<InitializeResult>(endpoint, 'initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        clientInfo: { name: 'kicad-studio-real-server-test', version: '1.0.0' },
        capabilities: {}
      });
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error(
    `Timed out waiting for kicad-mcp-pro initialize: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${stderr.join('')}`
  );
}

async function postJsonRpc<T>(
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string | undefined
): Promise<RpcResult<T>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'MCP-Session-Id': sessionId } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const nextSessionId = response.headers.get('MCP-Session-Id') ?? undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    return {
      json: parseSseJsonRpc<T>(await response.text()),
      sessionId: nextSessionId
    };
  }
  return {
    json: (await response.json()) as JsonRpcEnvelope<T>,
    sessionId: nextSessionId
  };
}

function parseSseJsonRpc<T>(payload: string): JsonRpcEnvelope<T> {
  const event = payload
    .split(/\r?\n\r?\n/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    )
    .filter(Boolean)
    .at(-1);
  if (!event) {
    throw new Error('Empty SSE payload from MCP server.');
  }
  return JSON.parse(event) as JsonRpcEnvelope<T>;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolve(address.port);
          return;
        }
        reject(new Error('Could not allocate a TCP port.'));
      });
    });
  });
}

function copyDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function writeServerArtifacts(
  artifactDir: string,
  details: {
    command: string;
    endpoint: string;
    projectDir: string;
    stdout: string[];
    stderr: string[];
    error?: unknown;
  }
): void {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, 'server-stdout.log'),
    details.stdout.join(''),
    'utf8'
  );
  fs.writeFileSync(
    path.join(artifactDir, 'server-stderr.log'),
    details.stderr.join(''),
    'utf8'
  );
  fs.writeFileSync(
    path.join(artifactDir, 'harness.json'),
    JSON.stringify(
      {
        command: details.command,
        endpoint: details.endpoint,
        projectDir: details.projectDir,
        error:
          details.error instanceof Error
            ? { name: details.error.name, message: details.error.message }
            : details.error
              ? String(details.error)
              : undefined
      },
      null,
      2
    ),
    'utf8'
  );
}

async function stopServer(
  server: ChildProcessWithoutNullStreams
): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }
  if (process.platform === 'win32' && server.pid) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], {
      stdio: 'ignore'
    });
    return;
  }
  server.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      server.once('exit', () => resolve(true));
    }),
    delay(2000).then(() => false)
  ]);
  if (!exited) {
    server.kill('SIGKILL');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
