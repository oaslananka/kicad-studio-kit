import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import axe, { type Result, type RunOptions } from 'axe-core';
import * as vscode from 'vscode';
import { buildChatHtml } from '../../src/ai/chatHtml';
import { buildComponentDetailsHtml } from '../../src/components/componentSearch';
import { buildDrcRuleEditorHtml } from '../../src/drc/drcRuleEditorPanel';
import { FixQueueProvider } from '../../src/mcp/fixQueueProvider';
import { McpToolsProvider } from '../../src/mcp/mcpToolsProvider';
import { QualityGateProvider } from '../../src/providers/qualityGateProvider';
import {
  createKiCanvasViewerHtml,
  createViewerErrorHtml
} from '../../src/providers/viewerHtml';
import { buildSettingsHtml } from '../../src/settings/settingsHtml';
import { KiCadStatusBar } from '../../src/statusbar/kicadStatusBar';
import type {
  ComponentSearchResult,
  FixItem,
  McpCapabilityCard
} from '../../src/types';
import {
  __setConfiguration,
  createExtensionContextMock,
  window as vscodeWindow
} from '../unit/vscodeMock';

jest.setTimeout(60_000);

const extensionRoot = path.resolve(__dirname, '../..');
type MediaOptions = Parameters<Page['emulateMedia']>[0];
type WebviewSurface = {
  name: string;
  html: string;
  expectedFocusOrder?: string[];
};
type ThemeFixture = {
  name: string;
  media: MediaOptions;
  css: string;
};

const axeOptions: RunOptions = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  }
};

describe('WCAG 2.1 AA webview conformance gate', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 }
    });
  });

  afterAll(async () => {
    await page?.close();
    await browser?.close();
  });

  it.each(themeSurfaceCases())(
    'has no automated axe-core A/AA violations in %s under %s',
    async (_surfaceName, _themeName, surface, theme) => {
      await page.emulateMedia(theme.media);
      await page.setContent(prepareForAxe(surface.html, theme.css), {
        waitUntil: 'domcontentloaded'
      });
      await page.addScriptTag({ content: axe.source });

      const results = await page.evaluate(async (options) => {
        return window.axe.run(document, options);
      }, axeOptions);

      expect(formatViolations(results.violations)).toEqual([]);
    }
  );

  it.each(webviewSurfaces().map((surface) => [surface.name, surface] as const))(
    'exposes accessible names and disabled reasons in %s',
    async (_name, surface) => {
      await page.emulateMedia({});
      await page.setContent(prepareForAxe(surface.html), {
        waitUntil: 'domcontentloaded'
      });

      expect(await collectInteractiveControlIssues(page)).toEqual([]);
    }
  );

  it.each(
    webviewSurfaces()
      .filter((surface) => surface.expectedFocusOrder?.length)
      .map((surface) => [surface.name, surface] as const)
  )(
    'keeps deterministic keyboard tab order and no focus trap in %s',
    async (_name, surface) => {
      await page.emulateMedia({});
      await page.setContent(prepareForAxe(surface.html), {
        waitUntil: 'domcontentloaded'
      });

      expect(
        await collectTabSequence(page, surface.expectedFocusOrder!.length)
      ).toEqual(surface.expectedFocusOrder);
    }
  );

  it.each(webviewSurfaces().map((surface) => [surface.name, surface] as const))(
    'ships focus-visible and reduced-motion affordances in %s',
    async (_name, surface) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setContent(prepareForAxe(surface.html), {
        waitUntil: 'domcontentloaded'
      });

      expect(await collectMotionAndFocusCssIssues(page)).toEqual([]);
    }
  );
});

describe('native VS Code surface accessibility gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.profile': 'full'
    });
  });

  it('labels MCP Tools, Quality Gates, and AI Fix Queue tree rows', async () => {
    const issues = [
      ...collectMcpToolsTreeIssues(),
      ...collectQualityGateTreeIssues(),
      ...(await collectFixQueueTreeIssues())
    ];

    expect(issues).toEqual([]);
  });

  it('keeps status bar icon rows named, described, and actionable', () => {
    const statusBar = new KiCadStatusBar({} as never);
    statusBar.update({
      activeProjectName: 'demo-board',
      cli: {
        path: '/usr/bin/kicad-cli',
        version: '10.0.3',
        versionLabel: 'KiCad 10.0.3',
        source: 'path'
      },
      drc: {
        file: 'board.kicad_pcb',
        errors: 1,
        warnings: 0,
        infos: 0,
        source: 'drc'
      },
      erc: {
        file: 'demo.kicad_sch',
        errors: 0,
        warnings: 1,
        infos: 0,
        source: 'erc'
      },
      aiConfigured: true,
      aiHealthy: false,
      mcpState: {
        kind: 'Connected',
        available: true,
        connected: true,
        server: {
          version: '1.0.0',
          compat: 'ok',
          capturedAt: new Date().toISOString(),
          capabilities: { tools: [], resources: [], prompts: [] }
        }
      },
      mcpProfile: 'full',
      activeVariant: 'prototype'
    });

    const statusItems = (
      vscodeWindow.createStatusBarItem as jest.Mock
    ).mock.results.map((result) => result.value as vscode.StatusBarItem);
    const issues = statusItems.flatMap((item, index) =>
      collectStatusBarItemIssues(index, item)
    );

    statusBar.dispose();
    expect(issues).toEqual([]);
  });
});

function webviewSurfaces(): WebviewSurface[] {
  const webview = createWebviewMock();
  return [
    {
      name: 'KiCad Studio Settings',
      html: buildSettingsHtml({
        webview,
        state: {
          aiKeyStored: true,
          octopartKeyStored: false,
          settings: {
            'kicadstudio.ai.provider': 'openai',
            'kicadstudio.ai.language': 'en',
            'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185'
          },
          cli: {
            path: '/usr/bin/kicad-cli',
            versionLabel: 'KiCad 10.0.3',
            source: 'auto-detected'
          }
        }
      })
    },
    {
      name: 'KiCad AI Chat',
      html: buildChatHtml({
        webview,
        extensionUri: vscode.Uri.file(extensionRoot)
      }),
      expectedFocusOrder: [
        '#provider',
        '#model',
        '#settings',
        '#export',
        '#clear',
        '#toggle-context',
        '#prompt',
        '#send'
      ]
    },
    {
      name: 'KiCad schematic viewer',
      html: createKiCanvasViewerHtml({
        title: 'KiCad Studio Schematic Viewer',
        fileName: 'demo.kicad_sch',
        fileType: 'schematic',
        status: 'Opening interactive renderer...',
        cspSource: webview.cspSource,
        kicanvasUri: `${webview.cspSource}/media/kicanvas/kicanvas.js`,
        viewerCssUri: 'vscode-resource:/media/styles/viewer.css',
        base64: Buffer.from('(kicad_sch)').toString('base64'),
        disabledReason: '',
        metadata: {
          notes: [
            'Schematic metadata is available outside the KiCanvas canvas.'
          ]
        }
      }),
      expectedFocusOrder: [
        '#reload-btn',
        '#open-kicad-btn',
        '#export-png-btn',
        '#export-svg-btn',
        '#fit-btn',
        '#zoom-in-btn',
        '#zoom-out-btn'
      ]
    },
    {
      name: 'KiCad PCB viewer',
      html: createKiCanvasViewerHtml({
        title: 'KiCad Studio PCB Viewer',
        fileName: 'demo.kicad_pcb',
        fileType: 'board',
        status: 'Opening interactive renderer...',
        cspSource: webview.cspSource,
        kicanvasUri: `${webview.cspSource}/media/kicanvas/kicanvas.js`,
        viewerCssUri: 'vscode-resource:/media/styles/viewer.css',
        base64: Buffer.from('(kicad_pcb)').toString('base64'),
        disabledReason: '',
        metadata: {
          layers: [
            {
              name: 'F.Cu',
              kind: 'signal',
              visible: true
            }
          ],
          tuningProfiles: [{ name: 'USB differential pair', layer: 'F.Cu' }]
        }
      }),
      expectedFocusOrder: [
        '#reload-btn',
        '#open-kicad-btn',
        '#export-png-btn',
        '#export-svg-btn',
        '#fit-btn',
        '#zoom-in-btn',
        '#zoom-out-btn',
        '#all-layers-btn',
        '#none-layers-btn',
        '#copper-layers-btn'
      ]
    },
    {
      name: 'KiCad viewer error state',
      html: createViewerErrorHtml(
        'demo.kicad_sch',
        new Error('Fixture failure for accessibility audit'),
        webview.cspSource
      )
    },
    {
      name: 'Legacy PCB viewer template',
      html: loadTemplate('pcb.html'),
      expectedFocusOrder: [
        '#btn-zoom-fit',
        '#btn-zoom-in',
        '#btn-zoom-out',
        '#btn-grid',
        '#btn-theme',
        '#btn-open-kicad',
        '[data-preset="All Cu"]',
        '[data-preset="Front"]',
        '[data-preset="Back"]',
        '[data-preset="Fab"]',
        '[data-preset="Assembly"]',
        '[data-preset="User"]'
      ]
    },
    {
      name: 'Legacy schematic viewer template',
      html: loadTemplate('schematic.html'),
      expectedFocusOrder: [
        '#btn-zoom-fit',
        '#btn-zoom-in',
        '#btn-zoom-out',
        '#btn-grid',
        '#btn-theme',
        '#btn-open-kicad'
      ]
    },
    {
      name: 'Bill of Materials view',
      html: loadTemplate('bom.html'),
      expectedFocusOrder: ['#search', '#toggle-dnp', '#table-wrapper']
    },
    {
      name: 'Netlist view',
      html: loadTemplate('netlist.html'),
      expectedFocusOrder: ['#table-wrapper']
    },
    { name: 'Visual diff view', html: loadTemplate('diff.html') },
    {
      name: 'Component Search details',
      html: createComponentSearchDetailsHtml(),
      expectedFocusOrder: ['#datasheet', '#copy', '#pcm-install']
    },
    {
      name: 'DRC rule editor',
      html: buildDrcRuleEditorHtml(),
      expectedFocusOrder: [
        '#name',
        '#condition',
        '#constraint',
        'Save Rule',
        '#delete-rule'
      ]
    }
  ];
}

function themeSurfaceCases(): Array<
  [
    surfaceName: string,
    themeName: string,
    surface: WebviewSurface,
    theme: ThemeFixture
  ]
> {
  return webviewSurfaces().flatMap((surface) =>
    themeFixtures().map(
      (theme): [string, string, WebviewSurface, ThemeFixture] => [
        surface.name,
        theme.name,
        surface,
        theme
      ]
    )
  );
}

function themeFixtures(): ThemeFixture[] {
  return [
    {
      name: 'dark',
      media: {
        colorScheme: 'dark',
        forcedColors: 'none',
        reducedMotion: 'no-preference'
      },
      css: vscodeThemeCss({
        background: '#1e1e1e',
        panel: '#252526',
        side: '#252526',
        text: '#f2f2f2',
        muted: '#cccccc',
        border: '#8a8a8a',
        focus: '#80bdff',
        danger: '#ff9b9b',
        input: '#111827',
        button: '#0e639c',
        buttonText: '#ffffff',
        buttonSecondary: '#3a3d41'
      })
    },
    {
      name: 'light',
      media: {
        colorScheme: 'light',
        forcedColors: 'none',
        reducedMotion: 'no-preference'
      },
      css: vscodeThemeCss({
        background: '#ffffff',
        panel: '#f3f3f3',
        side: '#f8f8f8',
        text: '#1f2328',
        muted: '#4b5563',
        border: '#6b7280',
        focus: '#005fb8',
        danger: '#b42318',
        input: '#ffffff',
        button: '#005fb8',
        buttonText: '#ffffff',
        buttonSecondary: '#e5e7eb'
      })
    },
    {
      name: 'high contrast',
      media: {
        colorScheme: 'dark',
        forcedColors: 'active',
        reducedMotion: 'reduce'
      },
      css: vscodeThemeCss({
        background: '#000000',
        panel: '#000000',
        side: '#000000',
        text: '#ffffff',
        muted: '#ffffff',
        border: '#ffffff',
        focus: '#ffff00',
        danger: '#ff6b6b',
        input: '#000000',
        button: '#000000',
        buttonText: '#ffffff',
        buttonSecondary: '#000000'
      })
    }
  ];
}

function vscodeThemeCss(theme: {
  background: string;
  panel: string;
  side: string;
  text: string;
  muted: string;
  border: string;
  focus: string;
  danger: string;
  input: string;
  button: string;
  buttonText: string;
  buttonSecondary: string;
}): string {
  return `
    :root {
      --vscode-editor-background: ${theme.background};
      --vscode-editorWidget-background: ${theme.panel};
      --vscode-sideBar-background: ${theme.side};
      --vscode-panel-border: ${theme.border};
      --vscode-editorWidget-border: ${theme.border};
      --vscode-foreground: ${theme.text};
      --vscode-descriptionForeground: ${theme.muted};
      --vscode-focusBorder: ${theme.focus};
      --vscode-errorForeground: ${theme.danger};
      --vscode-input-background: ${theme.input};
      --vscode-input-foreground: ${theme.text};
      --vscode-input-border: ${theme.border};
      --vscode-button-background: ${theme.button};
      --vscode-button-foreground: ${theme.buttonText};
      --vscode-button-hoverBackground: ${theme.button};
      --vscode-button-secondaryBackground: ${theme.buttonSecondary};
      --vscode-button-secondaryForeground: ${theme.text};
      --vscode-button-secondaryHoverBackground: ${theme.buttonSecondary};
      --vscode-badge-background: ${theme.buttonSecondary};
      --vscode-badge-foreground: ${theme.text};
      --vscode-font-family: "Segoe UI", sans-serif;
      --vscode-editor-font-family: Consolas, monospace;
      --bg: ${theme.background};
      --panel: ${theme.panel};
      --panel2: ${theme.panel};
      --side: ${theme.side};
      --border: ${theme.border};
      --text: ${theme.text};
      --muted: ${theme.muted};
      --accent: ${theme.focus};
      --danger: ${theme.danger};
      --input: ${theme.input};
    }
  `;
}

function createWebviewMock(): vscode.Webview {
  return {
    cspSource: 'vscode-resource:',
    asWebviewUri: (uri: vscode.Uri) =>
      vscode.Uri.parse(`vscode-resource:${uri.toString()}`)
  } as vscode.Webview;
}

function loadTemplate(fileName: string): string {
  return inlineLocalStylesheets(
    fs
      .readFileSync(
        path.join(extensionRoot, 'media', 'viewer', fileName),
        'utf8'
      )
      .replaceAll('{{cspSource}}', 'vscode-resource:')
      .replaceAll('{{scriptNonce}}', 'test-nonce')
      .replaceAll('{{bomCssUri}}', 'vscode-resource:/media/styles/bom.css')
      .replaceAll(
        '{{viewerCssUri}}',
        'vscode-resource:/media/styles/viewer.css'
      )
      .replaceAll(
        '{{kicanvasUri}}',
        'vscode-resource:/media/kicanvas/kicanvas.js'
      )
      .replaceAll('{{scriptUri}}', 'vscode-resource:/media/viewer/test.js')
      .replaceAll(
        '{{viewerScriptUri}}',
        'vscode-resource:/media/viewer/test-viewer.js'
      )
      .replaceAll(
        '{{initialPayload}}',
        JSON.stringify({ fileName: 'demo.kicad_pcb', kind: 'test' })
      )
  );
}

function prepareForAxe(
  html: string,
  themeCss = themeFixtures()[0]!.css
): string {
  const withInlinedStyles = inlineLocalStylesheets(html);
  const withoutCsp = withInlinedStyles.replace(
    /<meta\s+http-equiv=["']Content-Security-Policy["'][\s\S]*?>/giu,
    ''
  );
  const withoutScripts = removePairedElements(withoutCsp, 'script');
  const withoutExternalStyles = removeVoidElements(
    withoutScripts,
    'link',
    isStylesheetLink
  );
  return withoutExternalStyles.replace(
    /<head>/iu,
    `<head>
  <style>
    ${themeCss}
  </style>`
  );
}

function inlineLocalStylesheets(html: string): string {
  return html.replace(
    /<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']vscode-resource:\/media\/styles\/([^"']+)["'])[^>]*>/giu,
    (_match, fileName: string) =>
      `<style>${loadStylesheet(path.basename(fileName))}</style>`
  );
}

function loadStylesheet(fileName: string): string {
  return fs.readFileSync(
    path.join(extensionRoot, 'media', 'styles', fileName),
    'utf8'
  );
}

async function collectInteractiveControlIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter(isVisibleElement)
      .flatMap((element) => {
        const issues: string[] = [];
        const name = accessibleName(element);
        const visibleText = normalizedText(element.textContent ?? '');
        if (!name) {
          issues.push(
            `${controlSignature(element)} is missing an accessible name`
          );
        }
        if (
          name &&
          visibleText &&
          /[a-z0-9]/iu.test(visibleText) &&
          !(element instanceof HTMLInputElement) &&
          !(element instanceof HTMLTextAreaElement) &&
          !(element instanceof HTMLSelectElement) &&
          isActionControl(element) &&
          element.hasAttribute('aria-label') &&
          !normalizedText(name)
            .toLocaleLowerCase()
            .includes(visibleText.toLocaleLowerCase())
        ) {
          issues.push(
            `${controlSignature(element)} accessible name "${name}" does not include visible label "${visibleText}"`
          );
        }
        if (isDisabledControl(element) && !disabledReason(element)) {
          issues.push(
            `${controlSignature(element)} is disabled without aria-describedby, title, or reason text`
          );
        }
        return issues;
      });

    function isVisibleElement(element: HTMLElement): boolean {
      if (element.hidden || element.closest('[hidden]')) {
        return false;
      }
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function accessibleName(element: HTMLElement): string {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const label = labelledBy
          .split(/\s+/u)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ');
        if (normalizedText(label)) {
          return normalizedText(label);
        }
      }
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return normalizedText(ariaLabel);
      }
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        const label = Array.from(element.labels ?? [])
          .map((item) => item.textContent ?? '')
          .join(' ');
        if (normalizedText(label)) {
          return normalizedText(label);
        }
      }
      return normalizedText(
        element.getAttribute('alt') ??
          element.getAttribute('title') ??
          element.getAttribute('placeholder') ??
          element.textContent ??
          ''
      );
    }

    function disabledReason(element: HTMLElement): string {
      const describedBy = element.getAttribute('aria-describedby');
      const description = describedBy
        ? describedBy
            .split(/\s+/u)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        : '';
      const explicit =
        description ||
        element.getAttribute('title') ||
        element.getAttribute('aria-label') ||
        '';
      return /disabled|unavailable|requires|loading|empty|no |not |until|while/iu.test(
        explicit
      )
        ? normalizedText(explicit)
        : '';
    }

    function isDisabledControl(element: HTMLElement): boolean {
      return (
        ('disabled' in element &&
          Boolean(
            (element as HTMLButtonElement | HTMLInputElement).disabled
          )) ||
        element.getAttribute('aria-disabled') === 'true'
      );
    }

    function isActionControl(element: HTMLElement): boolean {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      return (
        tag === 'button' ||
        tag === 'a' ||
        role === 'button' ||
        role === 'link' ||
        role === 'menuitem'
      );
    }

    function controlSignature(element: HTMLElement): string {
      if (element.id) {
        return `#${element.id}`;
      }
      const preset = element.getAttribute('data-preset');
      if (preset) {
        return `[data-preset="${preset}"]`;
      }
      const label = element.getAttribute('aria-label');
      if (label) {
        return `[aria-label="${label}"]`;
      }
      return normalizedText(
        element.textContent ?? element.tagName.toLowerCase()
      );
    }

    function normalizedText(value: string): string {
      return value.replace(/\s+/gu, ' ').trim();
    }
  });
}

async function collectTabSequence(
  page: Page,
  count: number
): Promise<string[]> {
  const sequence: string[] = [];
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    sequence.push(await activeElementSignature(page));
  }
  expect(new Set(sequence).size).toBe(sequence.length);
  return sequence;
}

async function activeElementSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      return 'none';
    }
    if (element.id) {
      return `#${element.id}`;
    }
    const preset = element.getAttribute('data-preset');
    if (preset) {
      return `[data-preset="${preset}"]`;
    }
    const label = element.getAttribute('aria-label');
    if (label) {
      return `[aria-label="${label}"]`;
    }
    return (element.textContent ?? element.tagName.toLowerCase())
      .replace(/\s+/gu, ' ')
      .trim();
  });
}

async function collectMotionAndFocusCssIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');
    const focusable = document.querySelector(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const hasMotion = /animation\s*:|transition\s*:|@keyframes/iu.test(css);
    const issues: string[] = [];
    if (focusable && !/focus-visible/iu.test(css)) {
      issues.push('interactive surface is missing :focus-visible styling');
    }
    if (hasMotion && !/prefers-reduced-motion/iu.test(css)) {
      issues.push('animated surface is missing prefers-reduced-motion styling');
    }
    return issues;
  });
}

function createComponentSearchDetailsHtml(): string {
  const result: ComponentSearchResult = {
    source: 'octopart',
    mpn: 'STM32F411',
    manufacturer: 'STMicroelectronics',
    description: 'ARM Cortex-M4 MCU',
    datasheetUrl: 'https://example.com/stm32f411.pdf',
    offers: [],
    specs: [],
    pcmPackageId: 'stm32-library'
  };
  return buildComponentDetailsHtml(result, {
    nonce: 'test-nonce',
    cspSource: 'vscode-resource:'
  });
}

function collectMcpToolsTreeIssues(): string[] {
  const capabilities: McpCapabilityCard = {
    tools: ['pcb_validate'],
    resources: ['project://active'],
    prompts: ['manufacturing-review'],
    diagnostics: ['Live KiCad PCB context is unavailable.']
  };
  const provider = new McpToolsProvider({
    getState: () => ({
      kind: 'Connected',
      available: true,
      connected: true,
      install: { found: true, command: 'uvx', source: 'uvx', version: '1.0.0' },
      server: {
        version: '1.0.0',
        compat: 'ok',
        capturedAt: '2026-05-24T00:00:00.000Z',
        capabilities
      }
    })
  } as never);
  return collectTreeProviderIssues('MCP Tools', provider);
}

function collectQualityGateTreeIssues(): string[] {
  const context = createExtensionContextMock();
  const provider = new QualityGateProvider(context as never, {} as never);
  return collectTreeProviderIssues('Quality Gates', provider);
}

async function collectFixQueueTreeIssues(): Promise<string[]> {
  const item: FixItem = {
    id: 'fix-1',
    description: 'Move decoupling capacitor closer to U1',
    severity: 'warning',
    tool: 'pcb_move_component',
    args: {},
    status: 'pending',
    preview: 'diff --git a/board.kicad_pcb b/board.kicad_pcb'
  };
  const provider = new FixQueueProvider({
    fetchFixQueue: jest.fn().mockResolvedValue([item])
  } as never);
  await provider.refresh();
  return collectTreeProviderIssues('AI Fix Queue', provider);
}

function collectTreeProviderIssues(
  surfaceName: string,
  provider: vscode.TreeDataProvider<unknown>
): string[] {
  return walkTreeProvider(surfaceName, provider).flatMap(
    ({ path: itemPath, item }) => collectTreeItemIssues(itemPath, item)
  );
}

function walkTreeProvider(
  surfaceName: string,
  provider: vscode.TreeDataProvider<unknown>,
  element?: unknown,
  parentPath = surfaceName
): Array<{ path: string; item: vscode.TreeItem }> {
  const children = provider.getChildren(element) as unknown[];
  return children.flatMap((child) => {
    const item = provider.getTreeItem(child) as vscode.TreeItem;
    const label =
      typeof item.label === 'string'
        ? item.label
        : item.label
          ? String(item.label)
          : 'unlabeled';
    const itemPath = `${parentPath} > ${label}`;
    const descendants =
      item.collapsibleState !== vscode.TreeItemCollapsibleState.None
        ? walkTreeProvider(itemPath, provider, child, itemPath)
        : [];
    return [{ path: itemPath, item }, ...descendants];
  });
}

function collectTreeItemIssues(
  pathName: string,
  item: vscode.TreeItem
): string[] {
  const issues: string[] = [];
  const label = typeof item.label === 'string' ? item.label.trim() : '';
  const tooltip =
    typeof item.tooltip === 'string'
      ? item.tooltip.trim()
      : item.tooltip
        ? String(item.tooltip).trim()
        : '';
  const command = item.command as vscode.Command | undefined;
  if (!label) {
    issues.push(`${pathName} is missing a label`);
  }
  if (item.iconPath && !tooltip && !item.description) {
    issues.push(`${pathName} has an icon without tooltip or description`);
  }
  if (command && !command.title?.trim()) {
    issues.push(`${pathName} command is missing a title`);
  }
  return issues;
}

function collectStatusBarItemIssues(
  index: number,
  item: vscode.StatusBarItem
): string[] {
  if (!item.command) {
    return [];
  }
  const strippedText = item.text.replace(/\$\([^)]+\)/gu, '').trim();
  const tooltip = String(item.tooltip ?? '').trim();
  return [
    !strippedText ? `status bar item ${index} has only an icon label` : '',
    !tooltip ? `status bar item ${index} is missing a tooltip` : ''
  ].filter(Boolean);
}

function removePairedElements(html: string, tagName: string): string {
  const tag = tagName.toLowerCase();
  const lower = html.toLowerCase();
  const openNeedle = `<${tag}`;
  const closeNeedle = `</${tag}`;
  let output = '';
  let cursor = 0;

  while (cursor < html.length) {
    const openStart = lower.indexOf(openNeedle, cursor);
    if (openStart === -1) {
      output += html.slice(cursor);
      break;
    }

    const openEnd = lower.indexOf('>', openStart + openNeedle.length);
    if (openEnd === -1) {
      output += html.slice(cursor, openStart);
      break;
    }

    const closeStart = lower.indexOf(closeNeedle, openEnd + 1);
    if (closeStart === -1) {
      output += html.slice(cursor, openStart);
      break;
    }

    const closeEnd = lower.indexOf('>', closeStart + closeNeedle.length);
    if (closeEnd === -1) {
      output += html.slice(cursor, openStart);
      break;
    }

    output += html.slice(cursor, openStart);
    cursor = closeEnd + 1;
  }

  return output;
}

function removeVoidElements(
  html: string,
  tagName: string,
  shouldRemove: (element: string) => boolean
): string {
  const tag = tagName.toLowerCase();
  const lower = html.toLowerCase();
  const openNeedle = `<${tag}`;
  let output = '';
  let cursor = 0;

  while (cursor < html.length) {
    const openStart = lower.indexOf(openNeedle, cursor);
    if (openStart === -1) {
      output += html.slice(cursor);
      break;
    }

    const openEnd = lower.indexOf('>', openStart + openNeedle.length);
    if (openEnd === -1) {
      output += html.slice(cursor);
      break;
    }

    const element = html.slice(openStart, openEnd + 1);
    output += html.slice(cursor, openStart);
    if (!shouldRemove(element)) {
      output += element;
    }
    cursor = openEnd + 1;
  }

  return output;
}

function isStylesheetLink(element: string): boolean {
  const normalized = element.toLowerCase().replace(/\s+/gu, '');
  return (
    normalized.includes('rel="stylesheet"') ||
    normalized.includes("rel='stylesheet'")
  );
}

function formatViolations(violations: Result[]): string[] {
  return violations.map((violation) => {
    const targets = violation.nodes
      .slice(0, 3)
      .map((node) => `${node.target.join(' ')} ${node.failureSummary ?? ''}`)
      .join('; ');
    return `${violation.id} [${violation.impact ?? 'unknown'}] ${violation.help}: ${targets}`;
  });
}

declare global {
  interface Window {
    axe: typeof axe;
  }
}
