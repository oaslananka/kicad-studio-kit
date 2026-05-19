import * as fs from 'node:fs';
import * as path from 'node:path';

describe('package.json menus', () => {
  it('scopes every view/title contribution with a when-clause instead of an unsupported view field', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8')
    ) as {
      contributes?: {
        menus?: {
          'view/title'?: Array<Record<string, unknown>>;
        };
      };
    };

    const titleMenus = packageJson.contributes?.menus?.['view/title'] ?? [];
    expect(titleMenus.length).toBeGreaterThan(0);

    for (const item of titleMenus) {
      expect(item).not.toHaveProperty('view');
      expect(typeof item['when']).toBe('string');
      expect(String(item['when'])).toMatch(/^view == kicadstudio\./);
    }
  });
});
