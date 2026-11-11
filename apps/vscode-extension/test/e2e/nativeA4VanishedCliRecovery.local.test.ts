import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const demo = '/usr/share/kicad/demos/royalblue54L_feather';
const project = 'RoyalBlue54L-Feather';
const schematic = project + '.kicad_sch';
const names = [project + '.kicad_pro', schematic, project + '.kicad_pcb'];
const installedCli = '/usr/bin/kicad-cli';

const sha = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function exportBom(page: Page) {
  await page.keyboard.press('Control+Shift+P');
  const picker = page.locator('.quick-input-widget');
  await expect(picker).toBeVisible();
  await picker.locator('input').fill('>Bill of Materials');
  await expect(picker).toContainText('Export Bill of Materials (CSV)', {
    timeout: 7000
  });
  await picker.getByText('Export Bill of Materials (CSV)').first().click();
}

test('native A4: vanished CLI, partial output and user cancellation recover safely', async () => {
  // The disposable launcher executes the genuine installed KiCad from its
  // canonical location. It can disappear without modifying that installation.
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(installedCli) ||
      !names.every((name) => fs.existsSync(path.join(demo, name))),
    'Explicit real KiCad 10 + native VS Code opt-in; SKIP is not PASS'
  );
  test.setTimeout(300000);

  const baseline = names.map((name) => sha(path.join(demo, name)));
  const binarySandbox = fs.mkdtempSync(
    path.join(os.tmpdir(), 'studio-a4-real-kicad-bin-')
  );
  const cliCopy = path.join(binarySandbox, 'kicad-cli');
  const hiddenCli = path.join(binarySandbox, 'kicad-cli.disabled');
  fs.writeFileSync(cliCopy, '#!/bin/sh\nexec /usr/bin/kicad-cli "$@"\n', {
    mode: 0o700
  });
  expect(execFileSync(cliCopy, ['--version'], { encoding: 'utf8' })).toContain(
    '10.'
  );
  let session: Awaited<ReturnType<typeof launchVsCodeWithFixtures>> | undefined;
  try {
    session = await launchVsCodeWithFixtures({
      workspaceSourcePath: demo,
      settings: {
        'kicadstudio.kicadCliPath': cliCopy,
        'kicadstudio.defaultOutputDir': 'fab'
      }
    });
    const { page, workspacePath } = session;
    await expect(page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const entry = page
      .locator('.explorer-folders-view')
      .getByText(schematic, { exact: true });
    await expect(entry).toBeVisible({ timeout: 60000 });
    await entry.dblclick();
    await expect(page.locator('.tab.active')).toContainText(schematic, {
      timeout: 30000
    });

    await exportBom(page);
    const output = path.join(workspacePath, 'fab', project + '-bom.csv');
    await expect
      .poll(() => fs.existsSync(output) && fs.statSync(output).size > 40, {
        timeout: 90000
      })
      .toBe(true);
    expect(fs.readFileSync(output, 'utf8')).toContain('Reference');
    const firstSuccess = output + '.first-success';
    fs.renameSync(output, firstSuccess);
    const firstHash = sha(firstSuccess);
    console.log('A4_REAL_CLI_INITIAL_EXPORT=PASS');

    // The detector already knows the configured launcher path. Only this
    // disposable launcher disappears, while the installed KiCad stays intact.
    fs.renameSync(cliCopy, hiddenCli);
    expect(fs.existsSync(cliCopy)).toBe(false);
    await exportBom(page);
    const errorToast = page
      .locator('.notification-toast')
      .filter({ hasText: 'BOM export failed' });
    await expect(errorToast).toBeVisible({ timeout: 60000 });
    await expect(errorToast).toContainText(
      'KiCad CLI executable is no longer available'
    );
    await expect(errorToast).toContainText('restore');
    await expect(errorToast).not.toContainText(binarySandbox);
    expect(fs.existsSync(output)).toBe(false);
    expect(sha(firstSuccess)).toBe(firstHash);
    console.log('A4_REAL_CLI_VANISHED_ERROR=PASS');
    await test.info().attach('native-a4-vanished-cli-error', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });

    // Repair the same configured path and retry without restarting VS Code.
    fs.renameSync(hiddenCli, cliCopy);
    await exportBom(page);
    await expect
      .poll(() => fs.existsSync(output) && fs.statSync(output).size > 40, {
        timeout: 90000
      })
      .toBe(true);
    expect(fs.readFileSync(output, 'utf8')).toContain('Reference');
    console.log('A4_REAL_CLI_RESTORED_RETRY=PASS');
    await test.info().attach('native-a4-vanished-cli-recovery', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });

    // This isolated launcher deliberately writes incomplete temporary CSV
    // data and exits nonzero once. A real installed KiCad remains untouched.
    const restoredSuccess = output + '.restored-success';
    fs.renameSync(output, restoredSuccess);
    const restoredHash = sha(restoredSuccess);
    const marker = path.join(binarySandbox, 'fail-next-bom');
    const partialLocation = path.join(binarySandbox, 'partial-location');
    fs.writeFileSync(marker, 'fail one BOM command\n');
    const launcher = [
      '#!/bin/sh',
      'if [ "$1" = "sch" ] && [ "$2" = "export" ] && [ "$3" = "bom" ] && [ -f ' +
        JSON.stringify(marker) +
        ' ]; then',
      '  output=""',
      '  while [ "$#" -gt 1 ]; do',
      '    if [ "$1" = "--output" ]; then output="$2"; break; fi',
      '    shift',
      '  done',
      '  if [ -n "$output" ]; then',
      '    printf \'Reference,Value\\nR_PARTIAL,INCOMPLETE\\n\' > "$output"',
      '    printf "%s\\n" "$output" > ' + JSON.stringify(partialLocation),
      '    rm -f ' + JSON.stringify(marker),
      '    echo "Test-injected interrupted BOM CLI" >&2',
      '    exit 19',
      '  fi',
      'fi',
      'exec /usr/bin/kicad-cli "$@"',
      ''
    ].join('\n');
    fs.writeFileSync(cliCopy, launcher, { mode: 0o700 });

    await exportBom(page);
    const interruptedError = page
      .locator('.notification-toast')
      .filter({ hasText: 'KiCad CLI stopped before completing the export' });
    await expect(interruptedError).toBeVisible({ timeout: 30000 });
    await expect(interruptedError).toContainText('No final BOM file was saved');
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.existsSync(partialLocation)).toBe(true);
    const temporaryOutput = fs.readFileSync(partialLocation, 'utf8').trim();
    expect(fs.existsSync(temporaryOutput)).toBe(false);
    expect(sha(restoredSuccess)).toBe(restoredHash);
    console.log('A4_PARTIAL_CLI_OUTPUT_CLEANED=PASS');

    await exportBom(page);
    await expect
      .poll(() => fs.existsSync(output) && fs.statSync(output).size > 40, {
        timeout: 90000
      })
      .toBe(true);
    expect(fs.readFileSync(output, 'utf8')).toContain('Reference');
    for (const [i, name] of names.entries()) {
      expect(sha(path.join(demo, name))).toBe(baseline[i]);
      expect(sha(path.join(workspacePath, name))).toBe(baseline[i]);
    }
    console.log('A4_PARTIAL_CLI_RETRY=PASS');
    await test.info().attach('native-a4-partial-cli-recovery', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });

    // The cancellable progress notification must let a real user stop a
    // delayed CLI operation. The scoped launcher replaces KiCad with a sleep
    // only for this one step; system KiCad is never altered.
    const afterPartial = output + '.partial-retry-success';
    fs.renameSync(output, afterPartial);
    const delayedMarker = path.join(binarySandbox, 'delayed-bom-started');
    fs.writeFileSync(
      cliCopy,
      [
        '#!/bin/sh',
        'if [ "$1" = "sch" ] && [ "$2" = "export" ] && [ "$3" = "bom" ]; then',
        '  printf "started\\n" > ' + JSON.stringify(delayedMarker),
        '  exec sleep 30',
        'fi',
        'exec /usr/bin/kicad-cli "$@"',
        ''
      ].join('\n'),
      { mode: 0o700 }
    );
    await exportBom(page);
    await expect
      .poll(() => fs.existsSync(delayedMarker), {
        timeout: 30000
      })
      .toBe(true);
    const progressToast = page
      .locator('.notification-toast')
      .filter({ hasText: 'Collecting the complete multi-sheet BOM' });
    await expect(progressToast).toBeVisible({ timeout: 15000 });
    await progressToast.getByRole('button', { name: /cancel/i }).click();
    await expect(
      page.locator('.notification-toast').filter({
        hasText: 'BOM export cancelled'
      })
    ).toBeVisible({ timeout: 30000 });
    expect(fs.existsSync(output)).toBe(false);
    console.log('A4_USER_CANCEL_NO_BOM_OUTPUT=PASS');
    fs.writeFileSync(cliCopy, '#!/bin/sh\nexec /usr/bin/kicad-cli "$@"\n', {
      mode: 0o700
    });
    await exportBom(page);
    await expect
      .poll(() => fs.existsSync(output) && fs.statSync(output).size > 40, {
        timeout: 90000
      })
      .toBe(true);
    expect(fs.readFileSync(output, 'utf8')).toContain('Reference');
    for (const [i, name] of names.entries()) {
      expect(sha(path.join(demo, name))).toBe(baseline[i]);
      expect(sha(path.join(workspacePath, name))).toBe(baseline[i]);
    }
    console.log('A4_USER_CANCEL_RETRY=PASS');
    await test.info().attach('native-a4-user-cancel-recovery', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    if (session) await session.close();
    fs.rmSync(binarySandbox, { recursive: true, force: true });
  }
});
