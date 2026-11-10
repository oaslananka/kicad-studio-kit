import * as vscode from 'vscode';
import { COMMANDS } from '../../src/constants';
import { registerViewerCommands } from '../../src/commands/viewerCommands';
import { commands, window, workspace } from './vscodeMock';

describe('verified ERC source navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function registerSourceHandler() {
    registerViewerCommands({} as never);
    const handler = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([name]) => name === COMMANDS.revealVerifiedErcSource
    )?.[1];
    expect(handler).toEqual(expect.any(Function));
    return handler as (uri?: vscode.Uri, range?: vscode.Range) => Promise<void>;
  }

  it('opens a real Text Editor at the exact source position', async () => {
    const source = {
      ...vscode.Uri.file('/project/Connectors.kicad_sch'),
      scheme: 'file'
    } as vscode.Uri;
    const range = new vscode.Range(3351, 2, 3351, 3);
    const validatePosition = jest.fn((position) => position);
    const editor = { revealRange: jest.fn(), selection: undefined };
    (workspace.openTextDocument as jest.Mock).mockResolvedValue({
      uri: source,
      validatePosition
    });
    (window.showTextDocument as jest.Mock).mockResolvedValue(editor);
    const handler = registerSourceHandler();

    await handler(source, range);
    expect(workspace.openTextDocument).toHaveBeenCalledWith(source);
    expect(validatePosition).toHaveBeenCalledWith(
      expect.objectContaining({ line: 3351, character: 2 })
    );
    expect(window.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uri: source }),
      expect.objectContaining({
        preview: false,
        selection: expect.objectContaining({
          start: expect.objectContaining({ line: 3351, character: 2 })
        })
      })
    );
    expect(editor.revealRange).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.objectContaining({ line: 3351, character: 2 })
      }),
      vscode.TextEditorRevealType.InCenter
    );
  });

  it('does not open unverified, outside-workspace or invalid targets', async () => {
    const handler = registerSourceHandler();
    const range = new vscode.Range(10, 1, 10, 2);
    await handler(
      {
        ...vscode.Uri.file('/project/board.kicad_pcb'),
        scheme: 'file'
      } as vscode.Uri,
      range
    );
    await handler(
      {
        ...vscode.Uri.file('/project/child.kicad_sch'),
        scheme: 'https'
      } as vscode.Uri,
      range
    );
    await handler(
      {
        ...vscode.Uri.file('/project/child.kicad_sch'),
        scheme: 'file'
      } as vscode.Uri,
      new vscode.Range(-1, 0, -1, 0)
    );
    await handler();
    expect(workspace.openTextDocument).not.toHaveBeenCalled();
  });
});
