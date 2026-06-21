import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActivationState } from '../../src/activation/activationState';
import { readDesignBlockNames } from '../../src/activation/studioContextController';
import {
  WorkspaceContextController,
  type WorkspaceContextControllerDeps
} from '../../src/activation/workspaceContextController';

describe('#397 activation controllers', () => {
  describe('readDesignBlockNames', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-design-blocks-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('extracts unique design block names from a board file', () => {
      const file = path.join(tmpDir, 'board.kicad_pcb');
      fs.writeFileSync(
        file,
        [
          '(kicad_pcb',
          '  (design_block (id "a") (name "Power Supply"))',
          '  (design_block (id "b") (name "MCU Block"))',
          '  (design_block (id "c") (name "Power Supply"))',
          ')'
        ].join('\n'),
        'utf8'
      );

      const names = readDesignBlockNames(file);
      expect(names).toEqual(['Power Supply', 'MCU Block']);
    });

    it('returns an empty array for a missing file', () => {
      expect(readDesignBlockNames(path.join(tmpDir, 'nope.kicad_pcb'))).toEqual(
        []
      );
    });

    it('returns an empty array when there are no design blocks', () => {
      const file = path.join(tmpDir, 'plain.kicad_pcb');
      fs.writeFileSync(file, '(kicad_pcb (general))', 'utf8');
      expect(readDesignBlockNames(file)).toEqual([]);
    });
  });

  describe('ActivationState', () => {
    it('starts with unset fields and is mutable', () => {
      const state = new ActivationState();
      expect(state.aiHealthy).toBeUndefined();
      expect(state.latestDrcRun).toBeUndefined();
      state.aiHealthy = true;
      state.latestDrcRun = {
        file: 'a.kicad_pcb',
        diagnostics: [],
        summary: {} as never
      };
      expect(state.aiHealthy).toBe(true);
      expect(state.latestDrcRun?.file).toBe('a.kicad_pcb');
    });
  });

  describe('WorkspaceContextController project-refresh debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function makeController(refresh: jest.Mock, variantRefresh: jest.Mock) {
      const deps = {
        treeProvider: { refresh },
        variantProvider: { refresh: variantRefresh }
      } as unknown as WorkspaceContextControllerDeps;
      return new WorkspaceContextController(deps);
    }

    it('coalesces rapid schedule calls into a single tree refresh', () => {
      const refresh = jest.fn();
      const variantRefresh = jest.fn();
      const controller = makeController(refresh, variantRefresh);
      // Stub out the expensive context refresh so the timer callback is cheap.
      jest.spyOn(controller, 'refreshContexts').mockResolvedValue(undefined);

      controller.scheduleProjectRefresh();
      controller.scheduleProjectRefresh();
      controller.scheduleProjectRefresh();
      expect(refresh).not.toHaveBeenCalled();

      jest.runOnlyPendingTimers();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(variantRefresh).toHaveBeenCalledTimes(1);
    });

    it('dispose cancels a pending refresh', () => {
      const refresh = jest.fn();
      const variantRefresh = jest.fn();
      const controller = makeController(refresh, variantRefresh);
      const refreshContexts = jest
        .spyOn(controller, 'refreshContexts')
        .mockResolvedValue(undefined);

      controller.scheduleProjectRefresh();
      controller.dispose();
      jest.runOnlyPendingTimers();

      expect(refresh).not.toHaveBeenCalled();
      expect(refreshContexts).not.toHaveBeenCalled();
    });
  });
});
