import { COMMANDS } from '../../src/constants';
import { registerQualityGateCommands } from '../../src/commands/qualityGateCommands';
import { commands } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('registerQualityGateCommands', () => {
  let services: any;

  beforeEach(() => {
    jest.clearAllMocks();
    services = {
      qualityGateProvider: {
        runAll: jest.fn(),
        runGate: jest.fn(),
        showRaw: jest.fn(),
        openDocs: jest.fn()
      }
    };
    registerQualityGateCommands(services);
  });

  function handler(commandId: string): (...args: unknown[]) => unknown {
    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]: [string]) => id === commandId
    );
    if (!entry) throw new Error(`Command not registered: ${commandId}`);
    return entry[1];
  }

  it('registers qualityGateRunAll command', async () => {
    await handler(COMMANDS.qualityGateRunAll)();
    expect(services.qualityGateProvider.runAll).toHaveBeenCalledTimes(1);
  });

  it('registers qualityGateRunThis command with a plain gate result', async () => {
    const gate = { id: 'sch', label: 'Schematic', status: 'pass' };
    await handler(COMMANDS.qualityGateRunThis)(gate);
    expect(services.qualityGateProvider.runGate).toHaveBeenCalledWith(gate);
  });

  it('registers qualityGateRunThis command with a wrapped gate arg', async () => {
    const gate = { id: 'pwr', label: 'Power', status: 'warn' };
    await handler(COMMANDS.qualityGateRunThis)({ kind: 'gate', gate });
    expect(services.qualityGateProvider.runGate).toHaveBeenCalledWith(gate);
  });

  it('registers qualityGateShowRaw command', async () => {
    const gate = { id: 'place', label: 'Placement', status: 'pass' };
    await handler(COMMANDS.qualityGateShowRaw)(gate);
    expect(services.qualityGateProvider.showRaw).toHaveBeenCalledWith(gate);
  });

  it('registers qualityGateOpenDocs command with a gate', async () => {
    const gate = { id: 'mfgr', label: 'Manufacturing', status: 'fail' };
    await handler(COMMANDS.qualityGateOpenDocs)(gate);
    expect(services.qualityGateProvider.openDocs).toHaveBeenCalledWith(gate);
  });

  it('registers qualityGateOpenDocs command without a gate', async () => {
    await handler(COMMANDS.qualityGateOpenDocs)();
    expect(services.qualityGateProvider.openDocs).toHaveBeenCalledWith(
      undefined
    );
  });

  it('registers qualityGateOpenDocs with a wrapped gate arg', async () => {
    const gate = { id: 'conn', label: 'Connectivity', status: 'pass' };
    await handler(COMMANDS.qualityGateOpenDocs)({ kind: 'gate', gate });
    expect(services.qualityGateProvider.openDocs).toHaveBeenCalledWith(gate);
  });
});
