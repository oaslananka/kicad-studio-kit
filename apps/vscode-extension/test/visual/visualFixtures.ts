import { expect, type Page } from '@playwright/test';
import {
  createBomHtml,
  createNetlistHtml,
  installVsCodeApiMock,
  readFixtureBase64,
  setViewerContent,
  setWebviewContent
} from '../webview/webviewTestHarness';
import {
  FALLBACK_MIN_HEIGHT_RATIO,
  HEADER_MAX_HEIGHT,
  VIEWER_MIN_WIDTH_RATIO,
  type VisualFixture,
  type VisualTheme
} from './visualThemeMatrix';
import {
  bomRows,
  createValidationHtml,
  pcbLayers,
  schematicSvg,
  tuningProfiles
} from './visualFixtureData';

type ViewerOptions = Parameters<typeof setViewerContent>[1];
type MockOptions = NonNullable<Parameters<typeof setViewerContent>[2]>;

const VIEWER_BASE64 = {
  schematic: readFixtureBase64('sample.kicad_sch'),
  board: readFixtureBase64('sample.kicad_pcb')
};

export const VISUAL_FIXTURES: readonly VisualFixture[] = [
  viewerFixture({
    id: 'clean-schematic-issue-17-fallback-fit',
    fileType: 'schematic',
    fallbackSvg: schematicSvg('clean'),
    mockOptions: { surface: 'none' },
    options: {
      fileName: 'clean-schematic.kicad_sch',
      base64: VIEWER_BASE64.schematic,
      metadata: { sheets: [{ id: 'power', name: 'Power Sheet' }] }
    },
    verify: assertSchematicFallbackFit
  }),
  viewerFixture({
    id: 'clean-pcb-issue-18-toolbar-issue-19-collapsed-panel',
    fileType: 'board',
    mockOptions: { surface: 'canvas' },
    options: {
      fileName: 'clean-board.kicad_pcb',
      base64: VIEWER_BASE64.board,
      metadata: { layers: pcbLayers(6), notes: ['Clean board visual smoke'] }
    },
    verify: async (page) => {
      await assertToolbarHierarchy(page);
      await expect(page.locator('body')).toHaveClass(/tools-collapsed/);
    }
  }),
  viewerFixture({
    id: 'large-schematic-issue-17-dark-canvas-fit',
    fileType: 'schematic',
    fallbackSvg: schematicSvg('large'),
    mockOptions: { surface: 'none' },
    options: {
      fileName: 'large-schematic.kicad_sch',
      base64: VIEWER_BASE64.schematic,
      metadata: {
        sheets: Array.from({ length: 8 }, (_, index) => ({
          id: `sheet-${index + 1}`,
          name: `Subsystem ${index + 1}`
        })),
        notes: ['Large schematic fallback coverage']
      }
    },
    verify: assertSchematicFallbackFit
  }),
  viewerFixture({
    id: 'large-pcb-issue-19-layer-panel-overflow',
    fileType: 'board',
    mockOptions: { surface: 'canvas' },
    options: {
      fileName: 'large-board.kicad_pcb',
      base64: VIEWER_BASE64.board,
      metadata: {
        layers: pcbLayers(34),
        tuningProfiles: tuningProfiles(),
        notes: ['Panel intentionally expanded for overflow coverage']
      },
      restoreState: {
        zoom: 1,
        grid: true,
        theme: 'kicad',
        toolsPanelCollapsed: false
      }
    },
    verify: assertExpandedPanelLeavesCanvasRoom
  }),
  viewerFixture({
    id: 'empty-project-invalid-export-controls',
    fileType: 'schematic',
    mockOptions: { surface: 'none' },
    options: {
      fileName: 'empty-project.kicad_sch',
      base64: '',
      disabledReason:
        'Open a KiCad project with drawable content to preview it.'
    },
    verify: async (page) => {
      await expect(page.locator('#empty-overlay')).toBeVisible();
      await expect(page.locator('#export-png-btn')).toBeDisabled();
      await expect(page.locator('#fit-btn')).toBeDisabled();
    }
  }),
  validationFixture('drc-errors'),
  validationFixture('erc-errors'),
  bomFixture('bom-loading', async (page) => {
    await postMessage(page, {
      type: 'setStatus',
      payload: { status: 'loading' }
    });
    await expect(page.locator('#loading-row')).toHaveClass(/visible/);
    await expect(page.locator('#btn-export-csv')).toBeDisabled();
  }),
  bomFixture('bom-success', async (page) => {
    await postMessage(page, {
      type: 'setData',
      payload: {
        summary: { totalComponents: 5, uniqueValues: 3 },
        entries: bomRows()
      }
    });
    await expect(page.locator('#bom-rows tr')).toHaveCount(3);
    await expect(page.locator('#btn-export-csv')).toBeEnabled();
  }),
  bomFixture('bom-error', async (page) => {
    await postMessage(page, {
      type: 'setStatus',
      payload: { status: 'error', text: 'Could not load BOM from schematic.' }
    });
    await expect(page.locator('#bom-empty')).toHaveClass(/visible/);
    await expect(page.locator('#btn-export-csv')).toBeDisabled();
  }),
  netlistFixture('netlist-loading', {
    nets: [],
    status: 'Loading netlist from active schematic...'
  }),
  netlistFixture('netlist-success', {
    nets: [
      {
        netName: '/VBUS',
        nodes: [
          { reference: 'J1', pin: '1' },
          { reference: 'U1', pin: '4' }
        ]
      },
      {
        netName: '/I2C/SCL',
        nodes: [
          { reference: 'U1', pin: '12' },
          { reference: 'R3', pin: '1' }
        ]
      }
    ],
    status: '2 net entries'
  }),
  netlistFixture('netlist-error', {
    nets: [],
    status: 'Could not load netlist: kicad-cli exited with DRC context errors.'
  })
];

function viewerFixture(options: {
  id: string;
  fileType: 'schematic' | 'board';
  options: Omit<ViewerOptions, 'fileType' | 'theme' | 'fallbackBackground'>;
  mockOptions: MockOptions;
  fallbackSvg?: string;
  verify?: VisualFixture['verify'];
}): VisualFixture {
  return {
    id: options.id,
    verify: options.verify,
    prepare: async (page, theme) => {
      await installVsCodeApiMock(page, options.fallbackSvg);
      await setViewerContent(
        page,
        viewerOptions(options.fileType, options.options, theme),
        options.mockOptions
      );
      await expect(page.locator('#viewer-toolbar')).toBeVisible();
    }
  };
}

function viewerOptions(
  fileType: 'schematic' | 'board',
  options: Omit<ViewerOptions, 'fileType' | 'theme' | 'fallbackBackground'>,
  theme: VisualTheme
): ViewerOptions {
  return {
    ...options,
    fileType,
    theme: theme.viewerTheme,
    fallbackBackground: theme.fallbackBackground
  };
}

function bomFixture(
  id: string,
  loadState: (page: Page) => Promise<void>
): VisualFixture {
  return {
    id,
    prepare: async (page) => {
      await installVsCodeApiMock(page);
      await setWebviewContent(page, createBomHtml());
      await loadState(page);
    }
  };
}

function netlistFixture(
  id: string,
  payload: { nets: unknown[]; status: string }
): VisualFixture {
  return {
    id,
    prepare: async (page) => {
      await installVsCodeApiMock(page);
      await setWebviewContent(page, createNetlistHtml());
      await postMessage(page, { type: 'setNetlist', payload });
      await expect(netlistReadyLocator(page, payload.status)).toBeVisible();
    }
  };
}

function validationFixture(id: 'drc-errors' | 'erc-errors'): VisualFixture {
  return {
    id,
    prepare: async (page, theme) => {
      await page.setContent(createValidationHtml(id, theme.label), {
        waitUntil: 'load'
      });
    },
    verify: async (page) => {
      await expect(page.locator('[role="treeitem"]')).toHaveCount(4);
      await expect(page.locator('.validation-row.error')).toHaveCount(2);
    }
  };
}

async function assertSchematicFallbackFit(page: Page): Promise<void> {
  await expect(page.locator('#viewer-engine-badge')).toHaveText(
    'CLI SVG fallback'
  );
  const metrics = await page
    .locator('#svg-fallback-view')
    .evaluate((wrapper) => {
      const svg = wrapper.querySelector('svg');
      if (!svg) {
        throw new Error('Missing fallback SVG.');
      }
      return {
        wrapperHeight: wrapper.getBoundingClientRect().height,
        svgHeight: svg.getBoundingClientRect().height
      };
    });
  expect(metrics.svgHeight).toBeGreaterThan(
    metrics.wrapperHeight * FALLBACK_MIN_HEIGHT_RATIO
  );
}

async function assertToolbarHierarchy(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const header = document.querySelector('header');
    const toolbar = document.querySelector('#viewer-toolbar');
    const exportMenu = document.querySelector('#export-menu');
    if (!header || !toolbar || !exportMenu) {
      throw new Error('Missing viewer toolbar elements.');
    }
    return {
      headerHeight: header.getBoundingClientRect().height,
      toolbarTop: toolbar.getBoundingClientRect().top,
      exportTop: exportMenu.getBoundingClientRect().top
    };
  });
  expect(metrics.headerHeight).toBeLessThanOrEqual(HEADER_MAX_HEIGHT);
  expect(Math.abs(metrics.exportTop - metrics.toolbarTop)).toBeLessThanOrEqual(
    2
  );
}

async function assertExpandedPanelLeavesCanvasRoom(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toHaveClass(/tools-collapsed/);
  const metrics = await page.evaluate(() => {
    const mount = document.querySelector('#viewer-mount');
    const side = document.querySelector('#viewer-side-panel');
    if (!mount || !side) {
      throw new Error('Missing viewer layout elements.');
    }
    const mountWidth = mount.getBoundingClientRect().width;
    const sideWidth = side.getBoundingClientRect().width;
    return { mountWidth, sideWidth, total: mountWidth + sideWidth };
  });
  expect(metrics.mountWidth).toBeGreaterThan(
    metrics.total * VIEWER_MIN_WIDTH_RATIO
  );
}

async function postMessage(page: Page, message: unknown): Promise<void> {
  await page.evaluate((payload) => window.postMessage(payload, '*'), message);
}

function netlistReadyLocator(page: Page, status: string) {
  return status.startsWith('Could not')
    ? page.locator('#error-card.visible')
    : page.locator('#statsbar');
}
