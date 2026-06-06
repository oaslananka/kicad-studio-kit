import { ContextBridge } from '../../src/mcp/contextBridge';
import type { StudioContext } from '../../src/types';
import { __setConfiguration } from './vscodeMock';

describe('ContextBridge', () => {
  const context: StudioContext = {
    activeFile: 'board.kicad_pcb',
    fileType: 'pcb',
    drcErrors: ['clearance'],
    mcpConnected: true
  };

  beforeEach(() => {
    jest.useFakeTimers();
    __setConfiguration({
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.contextBridge.enabled': true,
      'kicadstudio.mcp.contextBridge.maxBytes': 64 * 1024
    });
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
      activeFile: 'board.kicad_pcb',
      mcpConnected: true
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

  it('gates pushing if mcp is not connected', async () => {
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext({ ...context, mcpConnected: false });
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(adapter.pushStudioContext).not.toHaveBeenCalled();
  });

  it('gates pushing if context push setting is disabled', async () => {
    __setConfiguration({
      'kicadstudio.mcp.pushContext': false
    });
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext(context);
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(adapter.pushStudioContext).not.toHaveBeenCalled();
  });

  it('gates pushing if context bridge enabled setting is disabled', async () => {
    __setConfiguration({
      'kicadstudio.mcp.contextBridge.enabled': false
    });
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext(context);
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(adapter.pushStudioContext).not.toHaveBeenCalled();
  });

  it('respects dynamic maxBytes setting and truncates large payloads', async () => {
    __setConfiguration({
      'kicadstudio.mcp.contextBridge.maxBytes': 120
    });
    const adapter = {
      pushStudioContext: jest.fn().mockResolvedValue(undefined)
    };
    const bridge = new ContextBridge(adapter as never);

    await bridge.pushContext({
      ...context,
      drcErrors: [
        'clearance_error_1',
        'clearance_error_2',
        'clearance_error_3'
      ],
      fileContents: 'abcdefghijklmnopqrstuvwxyz'
    });
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(adapter.pushStudioContext).toHaveBeenCalledTimes(1);
    const pushed = adapter.pushStudioContext.mock
      .calls[0]?.[0] as StudioContext;
    expect(pushed.drcErrors.length).toBeLessThan(3);
  });
});
