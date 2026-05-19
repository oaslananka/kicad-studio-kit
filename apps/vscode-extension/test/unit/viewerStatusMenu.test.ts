import { COMMANDS, SETTINGS } from '../../src/constants';
import { buildStatusMenuItems } from '../../src/commands/viewerStatusMenu';

describe('buildStatusMenuItems', () => {
  it('uses a workspace trust action instead of CLI detection setup in restricted workspaces', () => {
    const [trustItem] = buildStatusMenuItems({
      trusted: false,
      snapshot: {}
    });

    expect(trustItem).toEqual(
      expect.objectContaining({
        label: '$(shield) Restricted Mode',
        description: 'workspace trust required',
        command: 'workbench.trust.manage',
        args: []
      })
    );
  });

  it('shows CLI and diagnostics details in trusted workspaces', () => {
    const items = buildStatusMenuItems({
      trusted: true,
      cli: {
        path: '/opt/kicad/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'settings'
      },
      snapshot: {
        drc: {
          file: '/workspace/sample.kicad_pcb',
          errors: 2,
          warnings: 1,
          infos: 0,
          source: 'drc'
        },
        erc: {
          file: '/workspace/sample.kicad_sch',
          errors: 0,
          warnings: 0,
          infos: 1,
          source: 'erc'
        }
      }
    });

    expect(items[0]).toEqual(
      expect.objectContaining({
        label: '$(check) KiCad 10.0.1',
        description: 'settings',
        command: COMMANDS.detectCli
      })
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: COMMANDS.runDRC,
          description: '2 errors, 1 warnings, 0 info'
        }),
        expect.objectContaining({
          command: COMMANDS.runERC,
          description: '0 errors, 0 warnings, 1 info'
        })
      ])
    );
  });

  it('opens CLI settings when trusted but kicad-cli is not detected', () => {
    const [cliItem] = buildStatusMenuItems({
      trusted: true,
      snapshot: {}
    });

    expect(cliItem).toEqual(
      expect.objectContaining({
        label: '$(warning) kicad-cli not found',
        command: 'workbench.action.openSettings',
        args: [SETTINGS.cliPath]
      })
    );
  });
});
