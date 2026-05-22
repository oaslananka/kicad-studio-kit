import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';
import {
  PcmInstalledPackage,
  PcmPackage,
  PcmService
} from '../../src/library/pcmService';
import { PcmLibraryProvider } from '../../src/library/pcmLibraryProvider';
import { zipDirectory } from '../../src/utils/zipUtils';
import {
  __setConfiguration,
  createExtensionContextMock,
  window
} from './vscodeMock';

const PCM_STATE_KEY = 'kicadstudio.pcm.installedPackages.v1';
const FIXTURE_ROOT = path.resolve(__dirname, '..', 'fixtures', 'pcm');
const REPOSITORY_URL = pathToFileURL(
  path.join(FIXTURE_ROOT, 'repository.json')
).toString();
const ARCHIVE_V1 = Buffer.from('pcm archive v1');
const ARCHIVE_V2 = Buffer.from('pcm archive v2');

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-pcm-test-'));
}

function createPcmService(options: {
  context?: ReturnType<typeof createExtensionContextMock>;
  root?: string;
  fetchBytes?: jest.Mock;
} = {}): {
  context: ReturnType<typeof createExtensionContextMock>;
  root: string;
  service: PcmService;
  indexAll: jest.Mock;
  fetchBytes: jest.Mock;
} {
  const root = options.root ?? createTempRoot();
  const context = options.context ?? createExtensionContextMock();
  const indexAll = jest.fn().mockResolvedValue(undefined);
  const fetchBytes =
    options.fetchBytes ??
    jest.fn(async (url: string) => {
      if (url.startsWith('file://')) {
        return fs.readFileSync(new URL(url));
      }
      if (url.endsWith('1.0.0.zip')) {
        return ARCHIVE_V1;
      }
      if (url.endsWith('1.1.0.zip')) {
        return ARCHIVE_V2;
      }
      throw new Error(`unexpected fetch ${url}`);
    });

  __setConfiguration({
    'kicadstudio.pcm.repositoryUrls': [REPOSITORY_URL],
    'kicadstudio.pcm.configDir': path.join(root, 'config'),
    'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
  });

  const service = new PcmService(
    context as unknown as vscode.ExtensionContext,
    {
      getCommandHelp: jest.fn().mockResolvedValue(undefined)
    } as never,
    {
      runWithProgress: jest.fn()
    } as never,
    {
      indexAll
    } as never,
    {
      warn: jest.fn()
    } as never,
    {
      fetchBytes,
      now: () => new Date('2026-05-22T12:00:00.000Z'),
      extractArchive: (_archive, targetDir) => {
        const symbolPath = path.join(targetDir, 'symbols', 'Precision.kicad_sym');
        const footprintDir = path.join(targetDir, 'footprints', 'Precision.pretty');
        const footprintPath = path.join(footprintDir, 'Precision.kicad_mod');
        fs.mkdirSync(path.dirname(symbolPath), { recursive: true });
        fs.mkdirSync(footprintDir, { recursive: true });
        fs.writeFileSync(symbolPath, '(kicad_symbol_lib)\n', 'utf8');
        fs.writeFileSync(footprintPath, '(footprint "Precision")\n', 'utf8');
        return [symbolPath, footprintPath];
      }
    }
  );

  return { context, root, service, indexAll, fetchBytes };
}

describe('PcmService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    __setConfiguration({});
  });

  it('loads PCM repository fixtures and classifies package types', async () => {
    const { service } = createPcmService();

    const packages = await service.refreshRepositories();

    expect(packages).toHaveLength(2);
    expect(packages[0]).toEqual(
      expect.objectContaining({
        repositoryName: 'KiCad Studio PCM Fixture Repository',
        state: 'available',
        latestVersion: expect.objectContaining({ version: '1.1.0' })
      })
    );
    expect(packages[0]?.contentTypes).toContain('symbols');
    expect(packages[1]?.contentTypes).toEqual(['color-themes']);
  });

  it('installs a symbol package directly, verifies checksums, persists state, and refreshes library tables', async () => {
    const { context, root, service, indexAll, fetchBytes } = createPcmService();
    await service.refreshRepositories();

    const installed = await service.installPackage(
      'com.example.precision-symbols'
    );

    expect(installed).toEqual(
      expect.objectContaining({
        identifier: 'com.example.precision-symbols',
        version: '1.1.0',
        source: 'direct'
      })
    );
    expect(fetchBytes).toHaveBeenCalledWith(
      'https://example.com/precision-symbols-1.1.0.zip',
      expect.any(String)
    );
    expect(indexAll).toHaveBeenCalled();
    expect(
      context.globalState.get<PcmInstalledPackage[]>(PCM_STATE_KEY)
    ).toHaveLength(1);

    const installedPackages = JSON.parse(
      fs.readFileSync(
        path.join(root, 'config', 'installed_packages.json'),
        'utf8'
      )
    ) as { packages: Array<{ current_version: { version: string } }> };
    expect(installedPackages.packages[0]?.current_version.version).toBe('1.1.0');

    expect(
      fs.readFileSync(path.join(root, 'config', 'sym-lib-table'), 'utf8')
    ).toContain('PCM_com_example_precision-symbols_Precision');
    expect(
      fs.readFileSync(path.join(root, 'config', 'fp-lib-table'), 'utf8')
    ).toContain('PCM_com_example_precision-symbols_Precision');

    await expect(
      service.installPackage('com.example.precision-symbols')
    ).resolves.toEqual(installed);
  });

  it('uses kicad-cli pcm install when the detected CLI supports PCM', async () => {
    const root = createTempRoot();
    const context = createExtensionContextMock();
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [REPOSITORY_URL],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    const runner = {
      runWithProgress: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PcmService(
      context as unknown as vscode.ExtensionContext,
      {
        getCommandHelp: jest.fn().mockResolvedValue('Usage: kicad-cli pcm install')
      } as never,
      runner as never,
      { indexAll: jest.fn().mockResolvedValue(undefined) } as never,
      { warn: jest.fn() } as never,
      {
        fetchBytes: async (url) => {
          if (url.startsWith('file://')) {
            return fs.readFileSync(new URL(url));
          }
          throw new Error(`unexpected fetch ${url}`);
        },
        now: () => new Date('2026-05-22T12:00:00.000Z')
      }
    );

    await service.refreshRepositories();
    const installed = await service.installPackage(
      'com.example.precision-symbols'
    );

    expect(runner.runWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        command: ['pcm', 'install', 'com.example.precision-symbols']
      })
    );
    expect(installed.source).toBe('cli');
  });

  it('rejects packages when the downloaded archive checksum does not match', async () => {
    const { service } = createPcmService({
      fetchBytes: jest.fn(async (url: string) => {
        if (url.startsWith('file://')) {
          return fs.readFileSync(new URL(url));
        }
        return Buffer.from('corrupted archive');
      })
    });
    await service.refreshRepositories();

    await expect(
      service.installPackage('com.example.precision-symbols')
    ).rejects.toThrow(/checksum mismatch/i);
  });

  it('extracts a real PCM ZIP archive when no test extractor is injected', async () => {
    const root = createTempRoot();
    const archiveSource = path.join(root, 'archive-source');
    fs.mkdirSync(path.join(archiveSource, 'symbols'), { recursive: true });
    fs.mkdirSync(path.join(archiveSource, 'footprints', 'Fixture.pretty'), {
      recursive: true
    });
    fs.writeFileSync(
      path.join(archiveSource, 'symbols', 'Fixture.kicad_sym'),
      '(kicad_symbol_lib)\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(
        archiveSource,
        'footprints',
        'Fixture.pretty',
        'Fixture.kicad_mod'
      ),
      '(footprint "Fixture")\n',
      'utf8'
    );
    const archivePath = await zipDirectory(
      archiveSource,
      path.join(root, 'fixture.zip')
    );
    const archive = fs.readFileSync(archivePath);
    const repositoryUrl = writeDynamicRepository(root, archive);

    const context = createExtensionContextMock();
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [repositoryUrl],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    const service = new PcmService(
      context as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn().mockResolvedValue(undefined) } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn().mockResolvedValue(undefined) } as never,
      { warn: jest.fn() } as never,
      {
        fetchBytes: async (url) => {
          if (url.startsWith('file://')) {
            return fs.readFileSync(new URL(url));
          }
          if (url === 'https://example.com/dynamic.zip') {
            return archive;
          }
          throw new Error(`unexpected fetch ${url}`);
        },
        now: () => new Date('2026-05-22T12:00:00.000Z')
      }
    );

    await service.refreshRepositories();
    const installed = await service.installPackage('com.example.dynamic');

    expect(installed.extractedFiles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Fixture.kicad_sym'),
        expect.stringContaining('Fixture.kicad_mod')
      ])
    );
  });

  it('rejects a checksum-valid archive that is not a ZIP file', async () => {
    const root = createTempRoot();
    const badArchive = Buffer.from('not a zip');
    const repositoryUrl = writeDynamicRepository(root, badArchive);
    const context = createExtensionContextMock();
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [repositoryUrl],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    const service = new PcmService(
      context as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn().mockResolvedValue(undefined) } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn().mockResolvedValue(undefined) } as never,
      { warn: jest.fn() } as never,
      {
        fetchBytes: async (url) => {
          if (url.startsWith('file://')) {
            return fs.readFileSync(new URL(url));
          }
          return badArchive;
        }
      }
    );

    await service.refreshRepositories();
    await expect(service.installPackage('com.example.dynamic')).rejects.toThrow(
      /not a zip/i
    );
  });

  it('detects updates, performs bulk update, and uninstalls managed files and table entries', async () => {
    const root = createTempRoot();
    const context = createExtensionContextMock();
    const oldInstallPath = path.join(
      root,
      '3rdparty',
      'com_example_precision-symbols'
    );
    fs.mkdirSync(oldInstallPath, { recursive: true });
    const oldInstalled = createOldInstalledPackage(root);
    await context.globalState.update(PCM_STATE_KEY, [oldInstalled]);

    const { service } = createPcmService({ context, root });
    const packages = await service.refreshRepositories();
    const precisionPackage = packages.find(
      (pkg) => pkg.metadata.identifier === 'com.example.precision-symbols'
    );

    expect(precisionPackage?.state).toBe('update-available');

    await service.updateAllPackages();
    expect(
      context.globalState.get<PcmInstalledPackage[]>(PCM_STATE_KEY)?.[0]
        ?.version
    ).toBe('1.1.0');

    await service.uninstallPackage('com.example.precision-symbols');
    expect(context.globalState.get<PcmInstalledPackage[]>(PCM_STATE_KEY)).toEqual(
      []
    );
    expect(fs.existsSync(oldInstallPath)).toBe(false);
    expect(
      fs.readFileSync(path.join(root, 'config', 'sym-lib-table'), 'utf8')
    ).not.toContain('PCM_com_example_precision-symbols');
    expect(
      fs.readFileSync(path.join(root, 'config', 'installed_packages.json'), 'utf8')
    ).not.toContain('com.example.precision-symbols');

    await expect(
      service.uninstallPackage('com.example.precision-symbols')
    ).resolves.toBeUndefined();
  });

  it('searches PCM packages and finds install candidates for component results', async () => {
    const { service } = createPcmService();

    const searchResults = await service.findPackages('precision opamp');
    const candidate = await service.findInstallCandidateForResult({
      source: 'local',
      mpn: 'OPA192',
      manufacturer: 'Fixture',
      description: 'precision opamp',
      category: 'analog',
      offers: [],
      specs: [{ name: 'Keyword', value: 'opamp' }]
    });

    expect(searchResults[0]?.metadata.identifier).toBe(
      'com.example.precision-symbols'
    );
    expect(candidate?.metadata.identifier).toBe('com.example.precision-symbols');
    await expect(
      service.findInstallCandidateForResult({
        source: 'local',
        mpn: '',
        manufacturer: '',
        description: '',
        offers: [],
        specs: []
      })
    ).resolves.toBeUndefined();
    await expect(service.findPackages('')).resolves.toEqual([]);
  });

  it('normalizes PCM package variants from array feeds', async () => {
    const root = createTempRoot();
    const packages = [
      createRawPackage('com.example.plugin', 'Plugin Fixture', 'plugin', 'plugin', [
        'plugin'
      ]),
      createRawPackage(
        'com.example.footprints',
        'Footprint Fixture',
        'library',
        'footprints',
        ['footprint']
      ),
      createRawPackage('com.example.models', '3D Fixture', 'library', 'models', [
        '3d',
        'model'
      ]),
      createRawPackage('com.example.generic', 'Generic Fixture', 'library')
    ];
    const repositoryUrl = writeRepositoryWithPackages(root, packages, true);
    const { service } = createPcmService();
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [repositoryUrl],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });

    const loaded = await service.refreshRepositories();

    expect(
      loaded.find((pkg) => pkg.metadata.identifier === 'com.example.plugin')
        ?.contentTypes
    ).toEqual(['plugins']);
    expect(
      loaded.find((pkg) => pkg.metadata.identifier === 'com.example.footprints')
        ?.contentTypes
    ).toEqual(['footprints']);
    expect(
      loaded.find((pkg) => pkg.metadata.identifier === 'com.example.models')
        ?.contentTypes
    ).toEqual(['3d-models']);
    expect(
      loaded.find((pkg) => pkg.metadata.identifier === 'com.example.generic')
        ?.contentTypes
    ).toEqual(['symbols', 'footprints', '3d-models']);
  });

  it('resolves platform default config and third-party directories', () => {
    const root = createTempRoot();
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const previousConfigHome = process.env['KICAD_CONFIG_HOME'];
    const previousXdg = process.env['XDG_CONFIG_HOME'];
    const previousThirdParty = process.env['KICAD10_3RD_PARTY'];
    try {
      delete process.env['KICAD_CONFIG_HOME'];
      delete process.env['KICAD10_3RD_PARTY'];
      process.env['XDG_CONFIG_HOME'] = path.join(root, 'xdg');
      __setConfiguration({
        'kicadstudio.pcm.repositoryUrls': [REPOSITORY_URL],
        'kicadstudio.pcm.configDir': '',
        'kicadstudio.pcm.thirdPartyDir': ''
      });
      const service = new PcmService(
        createExtensionContextMock() as unknown as vscode.ExtensionContext,
        { getCommandHelp: jest.fn() } as never,
        { runWithProgress: jest.fn() } as never,
        { indexAll: jest.fn() } as never,
        { warn: jest.fn() } as never
      );

      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(service.getConfigDir()).toContain(
        path.join('Library', 'Preferences', 'kicad')
      );

      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(service.getConfigDir()).toContain('kicad');

      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(service.getConfigDir()).toBe(path.join(root, 'xdg', 'kicad'));
      expect(service.getThirdPartyDir()).toBe(
        path.join(root, 'xdg', 'kicad', '3rdparty')
      );
    } finally {
      if (platform) {
        Object.defineProperty(process, 'platform', platform);
      }
      restoreEnv('KICAD_CONFIG_HOME', previousConfigHome);
      restoreEnv('XDG_CONFIG_HOME', previousXdg);
      restoreEnv('KICAD10_3RD_PARTY', previousThirdParty);
    }
  });

  it('handles direct package targets, no-op updates, and platform path fallbacks', async () => {
    const previousConfigHome = process.env['KICAD_CONFIG_HOME'];
    const previousThirdParty = process.env['KICAD10_3RD_PARTY'];
    try {
      const root = createTempRoot();
      process.env['KICAD_CONFIG_HOME'] = path.join(root, 'env-config');
      process.env['KICAD10_3RD_PARTY'] = path.join(root, 'env-thirdparty');
      const { service } = createPcmService({ root });
      __setConfiguration({
        'kicadstudio.pcm.repositoryUrls': [REPOSITORY_URL],
        'kicadstudio.pcm.configDir': '',
        'kicadstudio.pcm.thirdPartyDir': ''
      });
      const packages = await service.refreshRepositories();
      const pkg = packages[0]!;

      expect(service.getConfigDir()).toBe(path.join(root, 'env-config'));
      expect(service.getThirdPartyDir()).toBe(path.join(root, 'env-thirdparty'));
      await expect(service.updatePackage(pkg)).resolves.toEqual(
        expect.objectContaining({ identifier: pkg.metadata.identifier })
      );
      await expect(service.updatePackage(pkg)).resolves.toEqual(
        expect.objectContaining({ identifier: pkg.metadata.identifier })
      );
      await expect(
        service.installPackage(withoutLatestVersion(pkg))
      ).rejects.toThrow(/no installable version/i);
      expect(service.getRepositories()).toHaveLength(1);
      expect(service.getInstalledPackages()).toHaveLength(1);
    } finally {
      if (typeof previousConfigHome === 'undefined') {
        delete process.env['KICAD_CONFIG_HOME'];
      } else {
        process.env['KICAD_CONFIG_HOME'] = previousConfigHome;
      }
      if (typeof previousThirdParty === 'undefined') {
        delete process.env['KICAD10_3RD_PARTY'];
      } else {
        process.env['KICAD10_3RD_PARTY'] = previousThirdParty;
      }
    }
  });

  it('logs repository refresh failures and rejects packages without installable versions', async () => {
    const root = createTempRoot();
    const context = createExtensionContextMock();
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': ['https://example.com/broken.json'],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    const warn = jest.fn();
    const service = new PcmService(
      context as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn().mockResolvedValue(undefined) } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn().mockResolvedValue(undefined) } as never,
      { warn } as never,
      {
        fetchBytes: jest.fn().mockRejectedValue(new Error('offline')),
        now: () => new Date('2026-05-22T12:00:00.000Z')
      }
    );

    await expect(service.refreshRepositories()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline'));
    await expect(service.installPackage('missing')).rejects.toThrow(
      /not found/i
    );
  });

  it('handles invalid repository packages, missing download metadata, and reindex warnings', async () => {
    const root = createTempRoot();
    const repositoryUrl = writeRepositoryWithPackages(
      root,
      [
        null,
        { name: 'Missing Identifier' },
        { identifier: 'com.example.missing-name' },
        {
          ...createRawPackage(
            'com.example.invalid-version',
            'Invalid Version Fixture',
            'library',
            'symbols'
          ),
          versions: [{ status: 'stable' }]
        },
        {
          ...createRawPackage(
            'com.example.no-download',
            'No Download Fixture',
            'library',
            'symbols'
          ),
          resources: undefined,
          versions: [{ version: '1.0.0', status: 'stable' }]
        }
      ],
      false,
      { includeSha256: false }
    );
    const warn = jest.fn();
    const { service } = createPcmService({ root });
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [repositoryUrl],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    const reindexingService = new PcmService(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn().mockResolvedValue(undefined) } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn().mockRejectedValue(new Error('index offline')) } as never,
      { warn } as never,
      {
        fetchBytes: async (url) => {
          if (url.startsWith('file://')) {
            return fs.readFileSync(new URL(url));
          }
          if (url.endsWith('1.0.0.zip')) {
            return ARCHIVE_V1;
          }
          if (url.endsWith('1.1.0.zip')) {
            return ARCHIVE_V2;
          }
          throw new Error(`unexpected fetch ${url}`);
        },
        now: () => new Date('2026-05-22T12:00:00.000Z'),
        extractArchive: (_archive, targetDir) => {
          const symbolPath = path.join(targetDir, 'symbols', 'NoDownload.kicad_sym');
          fs.mkdirSync(path.dirname(symbolPath), { recursive: true });
          fs.writeFileSync(symbolPath, '(kicad_symbol_lib)\n', 'utf8');
          return [symbolPath];
        }
      }
    );

    const loaded = await service.refreshRepositories();
    expect(loaded.map((pkg) => pkg.metadata.identifier)).toEqual([
      'com.example.invalid-version',
      'com.example.no-download'
    ]);
    await expect(
      service.installPackage('com.example.invalid-version')
    ).rejects.toThrow(/no installable version/i);
    await expect(service.installPackage('com.example.no-download')).rejects.toThrow(
      /download URL and SHA-256/i
    );

    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [REPOSITORY_URL],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    await reindexingService.refreshRepositories();
    await reindexingService.installPackage('com.example.precision-symbols');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('index offline'));
  });

  it('uses built-in fetch handling for file URLs, direct local paths, and HTTP failures', async () => {
    const root = createTempRoot();
    const repositoryUrl = writeRepositoryWithPackages(
      root,
      [createRawPackage('com.example.file-fetch', 'File Fetch Fixture', 'library')],
      false,
      { includeSha256: false }
    );
    const fileUrlService = new PcmService(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn() } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn() } as never,
      { warn: jest.fn() } as never
    );
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [repositoryUrl],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });

    await expect(fileUrlService.refreshRepositories()).resolves.toHaveLength(1);

    const localPackagesPath = path.join(root, 'local-packages.json');
    const localRepositoryPath = path.join(root, 'local-repository.json');
    fs.writeFileSync(
      localPackagesPath,
      `${JSON.stringify(
        {
          packages: [
            createRawPackage(
              'com.example.local-fetch',
              'Local Fetch Fixture',
              'library'
            )
          ]
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    fs.writeFileSync(
      localRepositoryPath,
      `${JSON.stringify(
        {
          name: 'Local Path Repository',
          packages: { url: localPackagesPath },
          schema_version: 2
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const localPathService = new PcmService(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn() } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn() } as never,
      { warn: jest.fn() } as never
    );
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': [localRepositoryPath],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });
    await expect(localPathService.refreshRepositories()).resolves.toHaveLength(1);

    const warn = jest.fn();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    } as never);
    const httpService = new PcmService(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      { getCommandHelp: jest.fn() } as never,
      { runWithProgress: jest.fn() } as never,
      { indexAll: jest.fn() } as never,
      { warn } as never
    );
    __setConfiguration({
      'kicadstudio.pcm.repositoryUrls': ['https://example.com/repository.json'],
      'kicadstudio.pcm.configDir': path.join(root, 'config'),
      'kicadstudio.pcm.thirdPartyDir': path.join(root, '3rdparty')
    });

    await expect(httpService.refreshRepositories()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 503'));
  });

  it('surfaces update badges and filters in the Libraries tree provider', async () => {
    const root = createTempRoot();
    const context = createExtensionContextMock();
    await context.globalState.update(PCM_STATE_KEY, [createOldInstalledPackage(root)]);
    const { service } = createPcmService({ context, root });
    const provider = new PcmLibraryProvider(service);

    await provider.refresh();
    const groups = await provider.getChildren();
    expect(provider.getTreeItem(groups[0]!).description).toContain('packages');
    provider.setFilter('symbols');
    const children = await provider.getChildren();
    const item = provider.getTreeItem(children[0]!);

    expect(item.description).toBe('Update 1.0.0 -> v1.1.0');
    expect(item.contextValue).toBe('pcmPackageUpdate');

    provider.setFilter('color-themes');
    const themeItem = provider.getTreeItem((await provider.getChildren())[0]!);
    expect(themeItem.contextValue).toBe('pcmPackageAvailable');
  });

  it('covers Libraries tree package states, child expansion, filter picking, and unwrap fallbacks', async () => {
    const available = createProviderPackage('Available Symbols', 'available', [
      'symbols'
    ]);
    const installed = createProviderPackage('Installed Footprints', 'installed', [
      'footprints'
    ]);
    const update = createProviderPackage('Updated Plugin', 'update-available', [
      'plugins'
    ]);
    const provider = new PcmLibraryProvider({
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      refreshRepositories: jest.fn().mockResolvedValue([
        available,
        installed,
        update
      ]),
      getPackages: jest.fn().mockReturnValue([available, installed, update])
    } as never);

    const root = await provider.getChildren();
    const pluginGroup = root.find((node) => (node as any).kind === 'plugins');
    expect(provider.getTreeItem(pluginGroup as never).description).toContain(
      'updates'
    );
    expect(await provider.getChildren(pluginGroup as never)).toHaveLength(1);
    expect(await provider.getChildren({ type: 'package', pkg: update } as never))
      .toEqual([]);

    const availableItem = provider.getTreeItem({
      type: 'package',
      pkg: available
    } as never);
    const installedItem = provider.getTreeItem({
      type: 'package',
      pkg: installed
    } as never);
    const updateItem = provider.getTreeItem({
      type: 'package',
      pkg: update
    } as never);
    expect(availableItem.contextValue).toBe('pcmPackageAvailable');
    expect(installedItem.contextValue).toBe('pcmPackageInstalled');
    expect(updateItem.contextValue).toBe('pcmPackageUpdate');

    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await provider.pickFilter();
    expect(provider.getFilter()).toBe('all');

    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: 'Plugins',
      value: 'plugins'
    });
    await provider.pickFilter();
    expect(provider.getFilter()).toBe('plugins');

    expect(provider.getTreeItem(root[0]!).contextValue).toMatch(/^pcmGroup/u);
    provider.dispose();
  });
});

function createOldInstalledPackage(root: string): PcmInstalledPackage {
  const metadata = {
    name: 'Precision Symbols',
    description: 'Precision analog symbol library',
    descriptionFull: 'Old installed fixture package.',
    identifier: 'com.example.precision-symbols',
    type: 'library',
    category: 'symbols',
    license: 'MIT',
    tags: ['precision', 'opamp', 'symbols'],
    resources: {},
    raw: {
      name: 'Precision Symbols',
      identifier: 'com.example.precision-symbols',
      type: 'library'
    },
    versions: [
      {
        version: '1.0.0',
        versionEpoch: 0,
        status: 'stable',
        kicadVersion: '8.0',
        platforms: []
      }
    ]
  };
  return {
    identifier: metadata.identifier,
    version: '1.0.0',
    repositoryId: 'fixture',
    repositoryName: 'Fixture Repository',
    repositoryUrl: REPOSITORY_URL,
    installedAt: '2026-05-21T00:00:00.000Z',
    installPath: path.join(root, '3rdparty', 'com_example_precision-symbols'),
    extractedFiles: [],
    checksum: '5892af8e75052cfaeb35e1ad1f1f264dc6eae385e9d84806263b49627f82383a',
    source: 'direct',
    package: metadata
  };
}

function createProviderPackage(
  name: string,
  state: PcmPackage['state'],
  contentTypes: PcmPackage['contentTypes']
): PcmPackage {
  const identifier = `com.example.${name.toLowerCase().replace(/[^a-z]+/gu, '-')}`;
  const pkg: PcmPackage = {
    repositoryId: 'fixture',
    repositoryName: 'Fixture Repository',
    repositoryUrl: REPOSITORY_URL,
    metadata: {
      name,
      description: `${name} description`,
      descriptionFull: '',
      identifier,
      type: contentTypes.includes('plugins') ? 'plugin' : 'library',
      category: contentTypes[0],
      license: 'MIT',
      tags: [contentTypes[0] ?? 'symbols'],
      resources: {},
      versions: [],
      raw: {}
    },
    latestVersion: {
      version: '2.0.0',
      versionEpoch: 0,
      status: 'stable',
      kicadVersion: '8.0',
      platforms: []
    },
    contentTypes,
    state
  };
  if (state === 'installed' || state === 'update-available') {
    pkg.installed = {
      identifier,
      version: '1.0.0',
      repositoryId: 'fixture',
      repositoryName: 'Fixture Repository',
      repositoryUrl: REPOSITORY_URL,
      installedAt: '2026-05-21T00:00:00.000Z',
      extractedFiles: [],
      source: 'direct',
      package: {
        name,
        description: `${name} description`,
        descriptionFull: '',
        identifier,
        type: 'library',
        category: contentTypes[0],
        license: 'MIT',
        tags: [],
        resources: {},
        versions: [],
        raw: {}
      }
    };
  }
  return pkg;
}

function writeDynamicRepository(root: string, archive: Buffer): string {
  const packageJson = {
    packages: [
      {
        name: 'Dynamic Symbols',
        description: 'Dynamic symbol library',
        description_full: 'Dynamic symbol library fixture.',
        identifier: 'com.example.dynamic',
        type: 'library',
        category: 'symbols',
        author: {
          name: 'Fixture Author',
          contact: { web: 'https://example.com' }
        },
        license: 'MIT',
        resources: {},
        tags: ['dynamic', 'symbols'],
        versions: [
          {
            version: '1.0.0',
            download_url: 'https://example.com/dynamic.zip',
            download_sha256: crypto
              .createHash('sha256')
              .update(archive)
              .digest('hex'),
            status: 'stable',
            kicad_version: '8.0'
          }
        ]
      }
    ]
  };
  const packagesPath = path.join(root, 'packages.json');
  fs.writeFileSync(packagesPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  const repositoryJson = {
    name: 'Dynamic Repository',
    packages: {
      url: 'packages.json',
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(packagesPath))
        .digest('hex'),
      update_timestamp: 1777374145
    },
    schema_version: 2
  };
  const repositoryPath = path.join(root, 'repository.json');
  fs.writeFileSync(
    repositoryPath,
    `${JSON.stringify(repositoryJson, null, 2)}\n`,
    'utf8'
  );
  return pathToFileURL(repositoryPath).toString();
}

function writeRepositoryWithPackages(
  root: string,
  packages: unknown[],
  asArray = false,
  options: { includeSha256?: boolean } = {}
): string {
  const payload = asArray ? packages : { packages };
  const packagesPath = path.join(root, 'packages.json');
  fs.writeFileSync(packagesPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const packagesResource: Record<string, unknown> = {
    url: 'packages.json',
    update_timestamp: 1777374145
  };
  if (options.includeSha256 ?? true) {
    packagesResource['sha256'] = crypto
      .createHash('sha256')
      .update(fs.readFileSync(packagesPath))
      .digest('hex');
  }
  const repositoryJson = {
    name: 'Variant Repository',
    packages: packagesResource,
    schema_version: 2
  };
  const repositoryPath = path.join(root, 'repository.json');
  fs.writeFileSync(
    repositoryPath,
    `${JSON.stringify(repositoryJson, null, 2)}\n`,
    'utf8'
  );
  return pathToFileURL(repositoryPath).toString();
}

function createRawPackage(
  identifier: string,
  name: string,
  type: string,
  category?: string,
  tags: string[] = []
): Record<string, unknown> {
  return {
    name,
    description: name,
    description_full: `${name} full description.`,
    identifier,
    type,
    ...(category ? { category } : {}),
    author: {
      name: 'Fixture Author',
      contact: { web: 'https://example.com' }
    },
    license: 'MIT',
    resources: {},
    tags,
    versions: [
      {
        version: '1.0.0',
        status: 'stable',
        kicad_version: '8.0'
      }
    ]
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === 'undefined') {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function withoutLatestVersion(pkg: PcmPackage): PcmPackage {
  const { latestVersion: _latestVersion, ...withoutLatest } = pkg;
  return {
    ...withoutLatest,
    metadata: {
      ...pkg.metadata,
      identifier: 'com.example.no-version'
    }
  };
}
