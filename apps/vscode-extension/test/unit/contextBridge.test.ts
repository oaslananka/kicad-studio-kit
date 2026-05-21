import { ContextBridge } from '../../src/mcp/contextBridge';
import type { StudioContext } from '../../src/types';

describe('ContextBridge', () => {
  const context: StudioContext = {
    activeFile: 'board.kicad_pcb',
    fileType: 'pcb',
    drcErrors: ['clearance']
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not push semantically identical context twice', async () => {
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext(context);
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await bridge.pushContext({
      fileType: 'pcb',
      drcErrors: ['clearance'],
      activeFile: 'board.kicad_pcb'
    });
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(adapter.pushStudioContext).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending context on dispose', async () => {
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext(context);
    bridge.dispose();
    await Promise.resolve();

    expect(adapter.pushStudioContext).toHaveBeenCalledWith(context);
  });

  it('uses source-aware delays for context push reasons', async () => {
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext(context, 'focus');
    jest.advanceTimersByTime(199);
    expect(adapter.pushStudioContext).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();

    expect(adapter.pushStudioContext).toHaveBeenCalledTimes(1);

    await bridge.pushContext({ ...context, selectedReference: 'U1' }, 'drc');
    await Promise.resolve();

    expect(adapter.pushStudioContext).toHaveBeenCalledTimes(2);
  });

  it('treats active variant, KiCad version, and design blocks as context-changing fields', async () => {
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext({
      ...context,
      activeVariant: 'Assembly-A',
      kicadVersion: '10.0.1',
      designBlocks: ['USB Power Input']
    });
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await bridge.pushContext({
      ...context,
      activeVariant: 'Assembly-B',
      kicadVersion: '10.0.1',
      designBlocks: ['USB Power Input', 'Sensor Front End']
    });
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(adapter.pushStudioContext).toHaveBeenCalledTimes(2);
  });
});
