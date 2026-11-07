import { expect, test } from '@playwright/test';
import {
  createViewerHtml,
  installVsCodeApiMock,
  readFixtureBase64,
  setWebviewContent
} from './webviewTestHarness';

test('a slow previous PCB preparation cannot replace a newly refreshed board', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  await page.goto('about:blank');

  await page.evaluate(() => {
    const state = {
      started: [] as number[],
      terminated: [] as number[],
      delivered: [] as number[]
    };
    (
      window as typeof window & { __preparationRace?: typeof state }
    ).__preparationRace = state;

    class ControlledPreparationWorker {
      onmessage:
        | ((event: {
            data: { ok: boolean; text: string; renderText: string };
          }) => void)
        | null = null;
      onerror: ((event: { message: string }) => void) | null = null;
      private readonly id = state.started.length + 1;
      private timer: number | undefined;
      private terminated = false;

      postMessage(request: { base64: string }): void {
        state.started.push(this.id);
        this.timer = window.setTimeout(
          () => {
            if (this.terminated) return;
            state.delivered.push(this.id);
            const raw = Uint8Array.from(atob(request.base64), (character) =>
              character.charCodeAt(0)
            );
            const text = new TextDecoder().decode(raw);
            this.onmessage?.({ data: { ok: true, text, renderText: text } });
          },
          this.id === 1 ? 900 : 0
        );
      }

      terminate(): void {
        this.terminated = true;
        if (this.timer !== undefined) window.clearTimeout(this.timer);
        state.terminated.push(this.id);
      }
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: ControlledPreparationWorker
    });
  });

  await setWebviewContent(
    page,
    createViewerHtml(
      {
        fileName: 'old-board.kicad_pcb',
        fileType: 'board',
        base64: readFixtureBase64('sample.kicad_pcb')
      },
      { surface: 'canvas' }
    )
  );

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __preparationRace: { started: number[] };
            }
          ).__preparationRace.started.length
      )
    )
    .toBe(1);

  await page.evaluate((base64) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'refresh',
          payload: {
            fileName: 'new-board.kicad_pcb',
            base64,
            metadata: {
              layers: [
                { name: 'F.Cu', kind: 'signal', visible: true },
                { name: 'B.Cu', kind: 'signal', visible: true }
              ]
            }
          }
        }
      })
    );
  }, readFixtureBase64('kicad10/multilayer_traces.kicad_pcb'));

  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: new-board.kicad_pcb',
    { timeout: 10000 }
  );

  // A late result from the first preparation must neither remount the older
  // document nor waste worker time after a newer refresh superseded it.
  await page.waitForTimeout(1100);
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: new-board.kicad_pcb'
  );
  const result = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __preparationRace: {
            started: number[];
            terminated: number[];
            delivered: number[];
          };
        }
      ).__preparationRace
  );
  expect(result.started).toEqual([1, 2]);
  expect(result.delivered).toEqual([2]);
  expect(result.terminated).toEqual([1, 2]);
});
