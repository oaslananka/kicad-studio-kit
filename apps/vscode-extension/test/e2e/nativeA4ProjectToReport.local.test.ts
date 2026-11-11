import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// Real native user journey with an official multi-sheet/PCB KiCad 10 demo.
// Opt-in and local only. All design files are copied into the isolated VS Code
// session. No manufacturing command, external review, cloud or user profile.
const sourceDir = '/usr/share/kicad/demos/royalblue54L_feather';
const project = 'RoyalBlue54L-Feather';
const pcb = project + '.kicad_pcb';
const sch = project + '.kicad_sch';
const cli = '/usr/bin/kicad-cli';

function hash(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function invoke(page: Page, query: string, label: string) {
  const picker = page.locator('.quick-input-widget');
  await expect(async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(query);
    await expect(picker).toContainText(label, { timeout: 4000 });
  }).toPass({ timeout: 30000 });
  await picker.getByText(label, { exact: false }).first().click();
}

async function openFromExplorer(page: Page, name: string) {
  const entry = page
    .locator('.explorer-folders-view')
    .getByText(name, { exact: true });
  await expect(entry).toBeVisible({ timeout: 60000 });
  await entry.dblclick();
  await expect(page.locator('.tab.active')).toContainText(name, {
    timeout: 30000
  });
}

async function waitForFile(file: string) {
  await expect
    .poll(() => fs.existsSync(file) && fs.statSync(file).size > 40, {
      timeout: 90000,
      intervals: [300, 800, 1600]
    })
    .toBe(true);
}

function refsFromCsv(file: string): Set<string> {
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .flatMap((row) =>
        // The reference column contains only designators; KiCad and Studio
        // have different grouping defaults, so compare ungrouped references.
        (
          row.match(/^(?:"([^"]+)"|([^,]+)),/)?.[1] ??
          row.match(/^(?:"([^"]+)"|([^,]+)),/)?.[2] ??
          ''
        )
          .split(/[\s,]+/)
          .filter(Boolean)
      )
  );
}

test('native A4 official KiCad project: schematic/PCB → ERC/DRC → BOM/PDF local evidence', async () => {
  // Intentionally skip only when the real local KiCad 10 demo, GUI host or explicit
  // opt-in is unavailable; routine CI cannot substitute a mock for native A4.
  // Run with KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1 on Linux. SKIP is not PASS.
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(cli) ||
      !fs.existsSync(path.join(sourceDir, pcb)),
    'Explicitly opted-in Linux KiCad 10 native acceptance'
  );
  test.setTimeout(540000);
  const names = [project + '.kicad_pro', pcb, sch, 'sch/Connectors.kicad_sch'];
  const originals = names.map((name) => hash(path.join(sourceDir, name)));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: sourceDir,
    settings: { 'kicadstudio.kicadCliPath': cli }
  });

  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    for (const [i, name] of names.entries()) {
      expect(hash(path.join(session.workspacePath, name))).toBe(originals[i]);
    }
    await expect(
      session.page
        .locator('.explorer-folders-view')
        .getByText(project + '.kicad_pro')
    ).toBeVisible();
    console.log('A4_PROJECT_DISCOVERY=PASS');

    await openFromExplorer(session.page, sch);
    console.log('A4_NATIVE_SCHEMATIC_TAB=PASS');
    await invoke(session.page, '>ERC', 'Run Electrical Rule Check (ERC)');
    const problems = session.page.locator('.markers-panel');
    await expect(problems).toBeVisible({ timeout: 150000 });
    await expect(problems).toContainText('kicad-cli:erc', { timeout: 150000 });
    console.log('A4_NATIVE_ERC_PROBLEMS=PASS');

    await openFromExplorer(session.page, pcb);
    console.log('A4_NATIVE_PCB_TAB=PASS');
    await invoke(session.page, '>DRC', 'Run Design Rule Check (DRC)');
    await expect(problems).toContainText('kicad-cli:drc', { timeout: 150000 });
    console.log('A4_NATIVE_DRC_PROBLEMS=PASS');

    await session.page.locator('.tab').filter({ hasText: sch }).first().click();
    await invoke(
      session.page,
      '>Bill of Materials',
      'Export Bill of Materials (CSV)'
    );
    const outDir = path.join(session.workspacePath, 'fab');
    const studioBom = path.join(outDir, project + '-bom.csv');
    await waitForFile(studioBom);
    console.log('A4_NATIVE_BOM_EXPORTED=' + fs.statSync(studioBom).size);

    await invoke(
      session.page,
      '>KiCad: Export PDF (Schematic)',
      'Export PDF (Schematic)'
    );
    const pdf = path.join(outDir, project + '.pdf');
    await waitForFile(pdf);
    expect(fs.readFileSync(pdf).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    console.log('A4_NATIVE_SCHEMATIC_PDF=PASS');

    const nativeBom = path.join(outDir, 'kicad-cli-reference-bom.csv');
    execFileSync(
      cli,
      [
        'sch',
        'export',
        'bom',
        '--output',
        nativeBom,
        path.join(session.workspacePath, sch)
      ],
      {
        cwd: session.workspacePath,
        timeout: 120000,
        stdio: 'pipe'
      }
    );
    const expectedRefs = refsFromCsv(nativeBom);
    const actualRefs = refsFromCsv(studioBom);
    const missing = [...expectedRefs].filter((ref) => !actualRefs.has(ref));
    const extra = [...actualRefs].filter((ref) => !expectedRefs.has(ref));
    console.log(
      'A4_BOM_REFERENCE_PARITY=' +
        JSON.stringify({
          expected: expectedRefs.size,
          actual: actualRefs.size,
          missing: missing.slice(0, 20),
          extra: extra.slice(0, 20)
        })
    );
    for (const [i, name] of names.entries()) {
      expect(hash(path.join(sourceDir, name))).toBe(originals[i]);
      expect(hash(path.join(session.workspacePath, name))).toBe(originals[i]);
    }
    console.log('A4_SOURCE_DESIGN_SHA256_UNCHANGED=PASS');
    // This is deliberately a real-product parity gate, not a snapshot of
    // whatever the extension happened to output.
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    await test.info().attach('native-a4-project-to-report', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
