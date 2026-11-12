import * as fs from 'node:fs';
import * as path from 'node:path';

interface ViewTitleAction {
  command: string;
  group?: string;
  when: string;
}

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
) as {
  contributes: {
    menus: {
      'view/title': ViewTitleAction[];
    };
  };
};

describe('compact native view headers', () => {
  const actions = packageJson.contributes.menus['view/title'];
  const primary = (id: string): ViewTitleAction[] =>
    actions.filter(
      (action) =>
        action.when.includes('view == ' + id) &&
        action.group?.startsWith('navigation')
    );

  it('preserves at most one inline action per expandable sidebar section', () => {
    for (const view of [
      'kicadstudio.projectTree',
      'kicadstudio.library',
      'kicadstudio.variants',
      'kicadstudio.fixQueue',
      'kicadstudio.qualityGate',
      'kicadstudio.drcRules'
    ]) {
      expect(primary(view)).toHaveLength(1);
    }
  });

  it('keeps the library refresh discoverable and moves secondary commands into More Actions', () => {
    const library = actions.filter((action) =>
      action.when.includes('view == kicadstudio.library')
    );
    expect(
      library.find((action) => action.command === 'kicadstudio.pcm.refresh')
        ?.group
    ).toBe('navigation');
    for (const command of [
      'kicadstudio.pcm.filter',
      'kicadstudio.pcm.updateAll'
    ]) {
      expect(
        library.find((action) => action.command === command)?.group
      ).toMatch(/^2_tools/);
    }
  });
});
