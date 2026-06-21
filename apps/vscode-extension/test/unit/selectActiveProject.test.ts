import {
  pickProjectFromQuickPick,
  resolveCommandProject
} from '../../src/commands/viewerCommands';
import { window } from './vscodeMock';
import type { CommandServices } from '../../src/commands/types';
import type { ProjectContext } from '../../src/types';

function makeProject(name: string): ProjectContext {
  return {
    id: `file:///ws/${name}/${name}.kicad_pro`,
    name,
    rootPath: `/ws/${name}`,
    projectFile: `/ws/${name}/${name}.kicad_pro`,
    workspaceFolder: '/ws'
  };
}

function makeServices(projects: ProjectContext[]): CommandServices {
  return {
    projectState: {
      getProjects: () => projects,
      findProjectById: (id: string) =>
        projects.find((project) => project.id === id),
      findProjectForResource: () => undefined
    }
  } as unknown as CommandServices;
}

describe('#407 active project picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pickProjectFromQuickPick', () => {
    it('warns and returns nothing for a no-project workspace', async () => {
      const services = makeServices([]);
      const picked = await pickProjectFromQuickPick(services);
      expect(picked).toBeUndefined();
      expect(window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('No KiCad project')
      );
      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    it('auto-selects the only project without prompting', async () => {
      const only = makeProject('alpha');
      const picked = await pickProjectFromQuickPick(makeServices([only]));
      expect(picked).toBe(only);
      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    it('prompts a quick pick when several projects are available', async () => {
      const projects = [makeProject('alpha'), makeProject('beta')];
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        project: projects[1]
      });
      const picked = await pickProjectFromQuickPick(makeServices(projects));
      expect(window.showQuickPick).toHaveBeenCalledTimes(1);
      expect(picked).toBe(projects[1]);
    });

    it('returns nothing when the quick pick is dismissed', async () => {
      const projects = [makeProject('alpha'), makeProject('beta')];
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
      const picked = await pickProjectFromQuickPick(makeServices(projects));
      expect(picked).toBeUndefined();
    });
  });

  describe('resolveCommandProject', () => {
    it('resolves a project id string via the project state', () => {
      const projects = [makeProject('alpha')];
      const resolved = resolveCommandProject(
        makeServices(projects),
        projects[0]!.id
      );
      expect(resolved).toEqual(projects[0]);
    });

    it('passes a ProjectContext target straight through', () => {
      const project = makeProject('alpha');
      expect(resolveCommandProject(makeServices([]), project)).toBe(project);
    });

    it('returns undefined for no target', () => {
      expect(
        resolveCommandProject(makeServices([]), undefined)
      ).toBeUndefined();
    });
  });
});
