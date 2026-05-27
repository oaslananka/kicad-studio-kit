import { COMMANDS, SETTINGS } from '../../src/constants';
import { buildStatusMenuItems } from '../../src/commands/viewerStatusMenu';

describe('buildStatusMenuItems', () => {
  it('uses a workspace trust action instead of CLI detection setup in restricted workspaces', () => {
    const trustItem = buildStatusMenuItems({
      trusted: false,
      snapshot: {}
    }).find((item) => item.label === '$(shield) Manage Workspace Trust');

    expect(trustItem).toEqual(
      expect.objectContaining({
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
      capabilities: {
        drc: true,
        erc: true,
        bom: true,
        netlist: true,
        gerbers: true,
        drill: true,
        jobset: true,
        pdf3d: true,
        odb: false,
        variantOption: true,
        allegroImport: false
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

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Status', kind: -1 }),
        expect.objectContaining({ label: 'Compatibility', kind: -1 }),
        expect.objectContaining({ label: 'Validate', kind: -1 }),
        expect.objectContaining({ label: 'Export', kind: -1 }),
        expect.objectContaining({ label: 'Libraries', kind: -1 }),
        expect.objectContaining({ label: 'AI & MCP', kind: -1 }),
        expect.objectContaining({ label: 'Settings', kind: -1 })
      ])
    );
    const detectedItem = items.find(
      (item) => item.label === '$(circuit-board) KiCad detected'
    );
    expect(detectedItem).toEqual(
      expect.objectContaining({
        description: 'KiCad 10.0.1 primary',
        detail: expect.stringContaining('/opt/kicad/bin/kicad-cli')
      })
    );
    expect(detectedItem).not.toHaveProperty('command');
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '$(pass) Design variants',
          description: 'available'
        }),
        expect.objectContaining({
          label: '$(warning) ODB++ export',
          description: 'missing odb',
          detail: expect.stringContaining('capability probe failed')
        }),
        expect.objectContaining({
          label: '$(pass) 3D PDF export',
          description: 'available'
        }),
        expect.objectContaining({
          label: '$(warning) Allegro PCB import',
          description: 'missing allegroImport'
        })
      ])
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: COMMANDS.runDRC,
          description: '2 errors, 1 warnings, 0 info - not recorded',
          detail:
            'Board design rules: /workspace/sample.kicad_pcb - updated not recorded'
        }),
        expect.objectContaining({
          command: COMMANDS.runERC,
          description: '0 errors, 0 warnings, 1 info - not recorded',
          detail:
            'Schematic electrical rules: /workspace/sample.kicad_sch - updated not recorded'
        })
      ])
    );
  });

  it('opens CLI settings when trusted but kicad-cli is not detected', () => {
    const items = buildStatusMenuItems({
      trusted: true,
      snapshot: {}
    });
    const statusItem = items.find(
      (item) => item.label === '$(warning) kicad-cli not detected'
    );
    const cliItem = items.find(
      (item) => item.label === '$(settings-gear) Configure kicad-cli path'
    );

    expect(statusItem).toEqual(
      expect.objectContaining({
        description: 'configure required'
      })
    );
    expect(statusItem).not.toHaveProperty('command');
    expect(cliItem).toEqual(
      expect.objectContaining({
        command: 'workbench.action.openSettings',
        args: [SETTINGS.cliPath]
      })
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '$(question) DRC, ERC, BOM, netlist, Gerbers',
          description: 'unknown'
        })
      ])
    );
  });
});
