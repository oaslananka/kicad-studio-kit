import {
  redactSensitivePath,
  redactSensitiveFields
} from '../../src/mcp/contextBridge';

describe('aiPrivacyRedaction', () => {
  describe('redactSensitivePath', () => {
    it('redacts .env files', () => {
      const result = redactSensitivePath('/home/user/project/.env');
      expect(result).toContain('<redacted>');
      expect(result).not.toBe('/home/user/project/.env');
    });

    it('redacts .env.* variants', () => {
      const result = redactSensitivePath('/home/user/project/.env.production');
      expect(result).toContain('<redacted>');
    });

    it('redacts .pem files', () => {
      const result = redactSensitivePath('C:\\Users\\me\\keys\\cert.pem');
      expect(result).toContain('<redacted>');
    });

    it('redacts .key files', () => {
      const result = redactSensitivePath('/etc/ssl/private/server.key');
      expect(result).toContain('<redacted>');
    });

    it('redacts .ssh directory paths', () => {
      const result = redactSensitivePath('/home/user/.ssh/id_rsa');
      expect(result).toContain('<redacted>');
    });

    it('redacts paths containing credentials', () => {
      const result = redactSensitivePath('/var/lib/credentials/service.json');
      expect(result).toContain('<redacted>');
    });

    it('redacts paths containing secrets', () => {
      const result = redactSensitivePath('/app/secrets/db-password.txt');
      expect(result).toContain('<redacted>');
    });

    it('redacts AWS credential paths', () => {
      const result = redactSensitivePath('/home/user/.aws/credentials');
      expect(result).toContain('<redacted>');
    });

    it('redacts GCloud credential paths', () => {
      const result = redactSensitivePath(
        '/home/user/.gcloud/application_default_credentials.json'
      );
      expect(result).toContain('<redacted>');
    });

    it('preserves normal KiCad project paths', () => {
      const result = redactSensitivePath(
        '/home/user/projects/my-board/my-board.kicad_pro'
      );
      expect(result).toBe('/home/user/projects/my-board/my-board.kicad_pro');
    });

    it('preserves normal schematic paths', () => {
      const result = redactSensitivePath(
        'C:\\Projects\\design\\main.kicad_sch'
      );
      expect(result).toBe('C:\\Projects\\design\\main.kicad_sch');
    });
  });

  describe('redactSensitiveFields', () => {
    it('redacts string values that are sensitive paths', () => {
      const input = { activeFile: '/home/user/.env', projectName: 'test' };
      const result = redactSensitiveFields(input);
      expect(result.activeFile).toContain('<redacted>');
      expect(result.projectName).toBe('test');
    });

    it('redacts sensitive paths in nested objects', () => {
      const input = {
        project: { root: '/app/.env', file: '/app/config.pem' },
        meta: { name: 'test' }
      };
      const result = redactSensitiveFields(input);
      expect(result.project.root).toContain('<redacted>');
      expect(result.project.file).toContain('<redacted>');
      expect(result.meta.name).toBe('test');
    });

    it('redacts sensitive paths in arrays', () => {
      const input = {
        files: ['/safe/path.kicad_pro', '/app/.env', '/safe/other.kicad_sch']
      };
      const result = redactSensitiveFields(input);
      expect(result.files[0]).toBe('/safe/path.kicad_pro');
      expect(result.files[1]).toContain('<redacted>');
      expect(result.files[2]).toBe('/safe/other.kicad_sch');
    });

    it('preserves non-string primitives', () => {
      const input = { count: 42, active: true, data: null, items: undefined };
      const result = redactSensitiveFields(input);
      expect(result).toEqual(input);
    });
  });
});
