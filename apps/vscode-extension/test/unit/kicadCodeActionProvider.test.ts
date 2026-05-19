import * as vscode from 'vscode';
import { COMMANDS } from '../../src/constants';
import { KiCadCodeActionProvider } from '../../src/providers/kicadCodeActionProvider';

describe('KiCadCodeActionProvider', () => {
  it('returns preferred KiCad quick fixes for matching fix queue rows', () => {
    const provider = new KiCadCodeActionProvider({
      getFixesForUri: jest.fn().mockReturnValue([
        {
          id: 'fix-1',
          title: 'Move R1',
          description: 'Move R1 away from connector',
          severity: 'warning',
          confidence: 0.95
        }
      ])
    } as never);

    const actions = provider.provideCodeActions(
      {
        uri: vscode.Uri.file('/project/board.kicad_pcb')
      } as never,
      new vscode.Range(9, 0, 9, 1)
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]?.title).toBe('KiCad Fix: Move R1');
    expect(actions[0]?.isPreferred).toBe(true);
    expect(actions[0]?.command).toEqual(
      expect.objectContaining({
        command: COMMANDS.applyFixQueueById,
        arguments: ['fix-1']
      })
    );
  });
});
