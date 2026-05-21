import * as fs from 'node:fs';
import { expect, test, type TestInfo } from '@playwright/test';
import { withRealServer } from '../integration/realServer/setup';
import { launchVsCodeWithFixtures, type VsCodeSession } from './vscodeHarness';

test.describe('KiCad Studio real-pair VS Code host', () => {
  test('opens a configured VS Code host and records debug artifacts', async ({
    browserName: _browserName
  }, testInfo) => {
    await withRealServer(async (server) => {
      const session = await launchVsCodeWithFixtures({
        workspaceSourcePath: server.projectDir,
        settings: {
          'kicadstudio.mcp.endpoint': extensionEndpoint(server.endpoint),
          'kicadstudio.mcp.profile': 'full',
          'kicadstudio.mcp.timeout': 20
        }
      });

      try {
        await expect(session.page.locator('.monaco-workbench')).toBeVisible({
          timeout: 60000
        });
        await expect(session.page.locator('.statusbar')).toBeVisible({
          timeout: 60000
        });
        await expect(session.page.locator('body')).not.toContainText(
          /MCP server is incompatible|MCP request timed out|Quality Gates are not available/
        );
        await attachScreenshot(
          session,
          testInfo,
          'real-pair-extension-host.png'
        );
      } catch (error) {
        await attachFailureArtifacts(session, testInfo);
        throw error;
      } finally {
        await session.close();
      }
    });
  });
});

function extensionEndpoint(jsonRpcEndpoint: string): string {
  return jsonRpcEndpoint.replace(/\/mcp$/, '');
}

async function attachFailureArtifacts(
  session: VsCodeSession,
  testInfo: TestInfo
): Promise<void> {
  await attachScreenshot(session, testInfo, 'real-pair-failure.png').catch(
    () => undefined
  );
  const logPath = testInfo.outputPath('vscode-real-pair.log');
  fs.writeFileSync(logPath, session.logs.join('\n'), 'utf8');
  await testInfo.attach('vscode-real-pair.log', {
    path: logPath,
    contentType: 'text/plain'
  });
}

async function attachScreenshot(
  session: VsCodeSession,
  testInfo: TestInfo,
  fileName: string
): Promise<void> {
  const screenshotPath = testInfo.outputPath(fileName);
  await session.page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(fileName, {
    path: screenshotPath,
    contentType: 'image/png'
  });
}
