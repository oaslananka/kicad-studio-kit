import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DesignBlockCache,
  StudioContextController,
  type StudioContextControllerDeps
} from '../../src/activation/studioContextController';
import {
  WorkspaceContextController,
  type WorkspaceContextControllerDeps
} from '../../src/activation/workspaceContextController';

describe('#398 context refresh performance', () => {
  describe('DesignBlockCache', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-dbc-'));
    });

    afterEach(() => {
      jest.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeBoard(file: string, blockName: string): void {
      fs.writeFileSync(
        file,
        `(kicad_pcb (design_block (id "x") (name "${blockName}")))`,
        'utf8'
      );
    }

    it('parses the file once for repeated reads with an unchanged mtime', () => {
      const file = path.join(tmpDir, 'board.kicad_pcb');
      writeBoard(file, 'Power');
      const reader = jest.fn(() => ['Power']);
      const cache = new DesignBlockCache(reader);

      expect(cache.read(file)).toEqual(['Power']);
      expect(cache.read(file)).toEqual(['Power']);
      expect(cache.read(file)).toEqual(['Power']);

      // Only the first read parses the file; later reads are served from cache.
      expect(reader).toHaveBeenCalledTimes(1);
    });

    it('re-parses when the file mtime changes', () => {
      const file = path.join(tmpDir, 'board.kicad_pcb');
      writeBoard(file, 'Power');
      const reader = jest.fn(() => ['Power']);
      const cache = new DesignBlockCache(reader);
      cache.read(file);

      writeBoard(file, 'MCU');
      // Force a distinct mtime so the change is detectable on fast filesystems.
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(file, future, future);
      cache.read(file);

      expect(reader).toHaveBeenCalledTimes(2);
    });

    it('returns an empty array and does not parse a missing file', () => {
      const reader = jest.fn(() => ['Power']);
      const cache = new DesignBlockCache(reader);

      expect(cache.read(path.join(tmpDir, 'nope.kicad_pcb'))).toEqual([]);
      expect(reader).not.toHaveBeenCalled();
    });
  });

  describe('StudioContextController.schedulePushStudioContext', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    function makeController() {
      return new StudioContextController(
        {} as unknown as StudioContextControllerDeps
      );
    }

    it('debounces rapid cursor pushes into a single push', () => {
      const controller = makeController();
      const push = jest
        .spyOn(controller, 'pushStudioContext')
        .mockResolvedValue(undefined);

      controller.schedulePushStudioContext('cursor');
      controller.schedulePushStudioContext('cursor');
      controller.schedulePushStudioContext('cursor');
      expect(push).not.toHaveBeenCalled();

      jest.runOnlyPendingTimers();
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('cursor');
    });

    it('passes non-cursor reasons straight through', () => {
      const controller = makeController();
      const push = jest
        .spyOn(controller, 'pushStudioContext')
        .mockResolvedValue(undefined);

      controller.schedulePushStudioContext('save');
      expect(push).toHaveBeenCalledWith('save');
    });

    it('dispose cancels a pending cursor push', () => {
      const controller = makeController();
      const push = jest
        .spyOn(controller, 'pushStudioContext')
        .mockResolvedValue(undefined);

      controller.schedulePushStudioContext('cursor');
      controller.dispose();
      jest.runOnlyPendingTimers();
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe('WorkspaceContextController.scheduleContextRefresh', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('coalesces rapid schedule calls into a single refresh', () => {
      const controller = new WorkspaceContextController(
        {} as unknown as WorkspaceContextControllerDeps
      );
      const refresh = jest
        .spyOn(controller, 'refreshContexts')
        .mockResolvedValue(undefined);

      controller.scheduleContextRefresh();
      controller.scheduleContextRefresh();
      controller.scheduleContextRefresh();
      expect(refresh).not.toHaveBeenCalled();

      jest.runOnlyPendingTimers();
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
