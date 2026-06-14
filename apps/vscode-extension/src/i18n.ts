export const SOURCE_MESSAGES = {
  workspaceTrustRequired:
    '{feature} requires a trusted workspace. Trust this workspace to run KiCad CLI, external KiCad, import, or export tooling.',
  selectMcpProfile: 'Select kicad-mcp-pro profile',
  chooseMcpProfile: 'Choose the MCP profile to use for this workspace',
  mcpProfileDetail: '{blurb} (as of MCP 1.0.0)',
  mcpProfileSetRestart:
    'MCP profile set to {profile}. Restart the MCP connection now?',
  restart: 'Restart',
  later: 'Later',
  diagnosticPendingNoCachedResult: 'PENDING - no cached result',
  diagnosticPendingRunAction: 'Not run - Run {label}',
  diagnosticSummary: '{status} - {errors} errors, {warnings} warnings',
  diagnosticNotRun: '{label} has not been run yet.',
  diagnosticStatusTooltip: '{label}: {status}',
  diagnosticErrors: '{count} errors',
  diagnosticWarnings: '{count} warnings',
  diagnosticInfos: '{count} info',
  runValidation: 'Run {label}',
  qualityGateRunThis: 'Run This Quality Gate',
  qualityGateReady: 'Ready',
  qualityGatePendingSchematic: 'Run schematic checks',
  qualityGatePendingConnectivity: 'Run connectivity checks',
  qualityGatePendingPlacement: 'Run placement checks',
  qualityGatePendingTransfer: 'Run PCB transfer checks',
  qualityGatePendingManufacturing: 'Run manufacturing checks',
  qualityGatePendingDefault: 'Run this quality gate',
  qualityGateClickRunWhenReady:
    'Click to run this gate when the project is ready.',
  qualityGateClickRerun: 'Click to rerun this gate.',
  qualityGateRunningAll: 'Running all quality gates...',
  qualityGateRunning: 'Running {gate} quality gate...',
  qualityGateStdioWarning:
    'Quality Gates are not available when kicad-mcp-pro is connected via VS Code stdio. ' +
    'Start kicad-mcp-pro with the HTTP transport (port 27185) to enable this feature.',
  drcRulesNoFileLabel: 'No DRC rules file',
  drcRulesNoFileDescription: 'Create or open a .kicad_dru file',
  drcRulesNoFileDetail:
    'Add a KiCad design-rules file to this workspace, then refresh this view to inspect custom rule constraints.',
  drcRulesCreateOrOpenCommand: 'Create or Open DRC Rules',
  drcRulesNoCustomRulesLabel: 'No custom rules found',
  drcRulesNoCustomRulesDescription: 'Add rules to .kicad_dru',
  drcRulesNoCustomRulesDetail:
    'The workspace has a .kicad_dru file, but no readable KiCad rule blocks were found.',
  drcRulesLoadErrorLabel: 'DRC rules could not load',
  drcRulesLoadErrorDescription: 'Fix rule syntax and refresh',
  fixQueueUnavailableLabel: 'Fix Queue unavailable',
  fixQueueUnavailableDescription: 'Use HTTP MCP transport',
  fixQueueSetupMcpCommand: 'Setup MCP Integration',
  fixQueueEmptyLabel: 'No pending AI fixes',
  fixQueueEmptyDescription: 'Run DRC/ERC or refresh MCP',
  fixQueueEmptyDetail:
    'No queued fixes are available for the active project. Run validation or refresh MCP capabilities to populate suggested repairs.',
  fixQueueRefreshCommand: 'Refresh MCP Fix Queue',
  fixQueueRefreshErrorLabel: 'Fix Queue could not refresh',
  fixQueueRefreshErrorDescription: 'Retry MCP connection',
  fixQueueRetryCommand: 'Retry MCP Connection',
  fixQueueBlockStdio:
    'Fix Queue needs the HTTP MCP transport; VS Code stdio cannot serve queued repair actions.',
  fixQueueBlockIncompatible:
    'Upgrade kicad-mcp-pro before loading AI repair actions.',
  fixQueueBlockDegraded:
    'The MCP connection was interrupted or is in a degraded state. {message} Retry the connection or check the MCP server status.',
  fixQueueBlockDefault:
    'Connect kicad-mcp-pro over HTTP before loading AI repair actions.',
  pcmNoLibrariesLabel: 'No PCM libraries indexed',
  pcmNoLibrariesDescription: 'Refresh PCM repositories',
  pcmNoLibrariesDetail:
    'No KiCad Package and Content Manager packages are indexed yet. Refresh repositories or check the PCM repository settings.',
  pcmRefreshRepositoriesCommand: 'Refresh PCM Repositories',
  variantNoProjectLabel: 'No KiCad project file',
  variantNoProjectDescription: 'Open a .kicad_pro project',
  variantNoProjectDetail:
    'Variants are stored in the KiCad project file. Open or add a .kicad_pro file before creating assembly variants.',
  variantNoVariantsLabel: 'No variants configured',
  variantNoVariantsDescription: 'Create assembly variant',
  variantNoVariantsDetail:
    'This project does not define assembly variants yet. Create a named variant before comparing BOM outputs.',
  variantCreateCommand: 'Create Assembly Variant',
  settingsMigrationFailed:
    'KiCad Studio settings migration failed. Existing settings were left at the last successful schema version; check the KiCad Studio output for details.',
  settingsMigrationUpdatedDeprecatedSettings:
    'KiCad Studio updated deprecated settings to the current schema.',
  feedbackOpenFailed:
    'Could not open the feedback form automatically. You can access it manually at: {url}',
  boardReadyOpsNotConfigured:
    'BoardReadyOps is not configured. Enable it in the KiCad Studio settings to check board readiness.',
  boardReadyOpsOpenSettingsAction: 'Open Settings',
  boardReadyOpsRunning:
    'BoardReadyOps check queued. Results will appear when the service responds.',
  boardReadyOpsReportNotAvailable:
    'No BoardReadyOps report is available yet. Configure and run a readiness check first.',
  boardReadyOpsDocsOpenFailed:
    'Could not open the BoardReadyOps documentation automatically.'
} as const;

const TR_MESSAGES: Partial<Record<keyof typeof SOURCE_MESSAGES, string>> = {
  workspaceTrustRequired:
    '{feature} güvenilir bir çalışma alanı gerektirir. KiCad CLI, harici KiCad, içe veya dışa aktarma araçlarını çalıştırmak için bu çalışma alanına güvenin.',
  selectMcpProfile: 'kicad-mcp-pro profili seçin',
  chooseMcpProfile: 'Bu çalışma alanı için kullanılacak MCP profilini seçin',
  mcpProfileDetail: '{blurb} (MCP 1.0.0 itibarıyla)',
  mcpProfileSetRestart:
    'MCP profili {profile} olarak ayarlandı. MCP bağlantısı şimdi yeniden başlatılsın mı?',
  restart: 'Yeniden Başlat',
  later: 'Sonra',
  diagnosticPendingNoCachedResult: 'BEKLEMEDE - önbellekte sonuç yok',
  diagnosticPendingRunAction: 'Çalıştırılmadı - {label} çalıştır',
  diagnosticSummary: '{status} - {errors} hata, {warnings} uyarı',
  diagnosticNotRun: '{label} henüz çalıştırılmadı.',
  diagnosticStatusTooltip: '{label}: {status}',
  diagnosticErrors: '{count} hata',
  diagnosticWarnings: '{count} uyarı',
  diagnosticInfos: '{count} bilgi',
  runValidation: '{label} çalıştır',
  qualityGateRunThis: 'Bu Kalite Kapısını Çalıştır',
  qualityGateReady: 'Hazır',
  qualityGatePendingSchematic: 'Şema kontrollerini çalıştır',
  qualityGatePendingConnectivity: 'Bağlantı kontrollerini çalıştır',
  qualityGatePendingPlacement: 'Yerleşim kontrollerini çalıştır',
  qualityGatePendingTransfer: 'PCB transfer kontrollerini çalıştır',
  qualityGatePendingManufacturing: 'Üretim kontrollerini çalıştır',
  qualityGatePendingDefault: 'Bu kalite kapısını çalıştır',
  qualityGateClickRunWhenReady:
    'Proje hazır olduğunda bu kapıyı çalıştırmak için tıklayın.',
  qualityGateClickRerun: 'Bu kapıyı yeniden çalıştırmak için tıklayın.',
  qualityGateRunningAll: 'Tüm kalite kapıları çalıştırılıyor...',
  qualityGateRunning: '{gate} kalite kapısı çalıştırılıyor...',
  qualityGateStdioWarning:
    'Kalite Kapıları, kicad-mcp-pro VS Code stdio üzerinden bağlandığında kullanılamaz. ' +
    "Bu özelliği etkinleştirmek için kicad-mcp-pro'yu HTTP taşıyıcısıyla (port 27185) başlatın.",
  drcRulesNoFileLabel: 'DRC kural dosyası yok',
  drcRulesNoFileDescription: 'Bir .kicad_dru dosyası oluşturun veya açın',
  drcRulesNoFileDetail:
    'Bu çalışma alanına bir KiCad tasarım kuralı dosyası ekleyin, ardından özel kural kısıtlamalarını incelemek için bu görünümü yenileyin.',
  drcRulesCreateOrOpenCommand: 'DRC Kuralları Oluştur veya Aç',
  drcRulesNoCustomRulesLabel: 'Özel kural bulunamadı',
  drcRulesNoCustomRulesDescription: '.kicad_dru dosyasına kurallar ekleyin',
  drcRulesNoCustomRulesDetail:
    'Çalışma alanında bir .kicad_dru dosyası var ancak okunabilir KiCad kural bloğu bulunamadı.',
  drcRulesLoadErrorLabel: 'DRC kuralları yüklenemedi',
  drcRulesLoadErrorDescription: 'Kural sözdizimini düzeltin ve yenileyin',
  fixQueueUnavailableLabel: 'Düzeltme Kuyruğu kullanılamıyor',
  fixQueueUnavailableDescription: 'HTTP MCP taşıyıcısı kullanın',
  fixQueueSetupMcpCommand: 'MCP Entegrasyonu Ayarla',
  fixQueueEmptyLabel: 'Bekleyen AI düzeltmesi yok',
  fixQueueEmptyDescription: "DRC/ERC çalıştırın veya MCP'yi yenileyin",
  fixQueueEmptyDetail:
    'Aktif proje için sıraya alınmış düzeltme bulunamadı. Önerilen onarımları doldurmak için doğrulama çalıştırın veya MCP yeteneklerini yenileyin.',
  fixQueueRefreshCommand: 'MCP Düzeltme Kuyruğunu Yenile',
  fixQueueRefreshErrorLabel: 'Düzeltme Kuyruğu yenilenemedi',
  fixQueueRefreshErrorDescription: 'MCP bağlantısını yeniden dene',
  fixQueueRetryCommand: 'MCP Bağlantısını Yeniden Dene',
  fixQueueBlockStdio:
    'Düzeltme Kuyruğu HTTP MCP taşıyıcısı gerektirir; VS Code stdio sıraya alınmış onarım eylemlerini sunamaz.',
  fixQueueBlockIncompatible:
    "AI onarım eylemlerini yüklemeden önce kicad-mcp-pro'yu yükseltin.",
  fixQueueBlockDegraded:
    'MCP bağlantısı kesildi veya bozulmuş durumda. {message} Bağlantıyı yeniden deneyin veya MCP sunucu durumunu kontrol edin.',
  fixQueueBlockDefault:
    "AI onarım eylemlerini yüklemeden önce kicad-mcp-pro'yu HTTP üzerinden bağlayın.",
  pcmNoLibrariesLabel: 'Dizinlenmiş PCM kütüphanesi yok',
  pcmNoLibrariesDescription: 'PCM depolarını yenile',
  pcmNoLibrariesDetail:
    'Henüz hiçbir KiCad Paket ve İçerik Yöneticisi paketi dizinlenmemiş. Depoları yenileyin veya PCM deposu ayarlarını kontrol edin.',
  pcmRefreshRepositoriesCommand: 'PCM Depolarını Yenile',
  variantNoProjectLabel: 'KiCad proje dosyası yok',
  variantNoProjectDescription: 'Bir .kicad_pro projesi açın',
  variantNoProjectDetail:
    'Varyantlar KiCad proje dosyasında saklanır. Montaj varyantları oluşturmadan önce bir .kicad_pro dosyası açın veya ekleyin.',
  variantNoVariantsLabel: 'Yapılandırılmış varyant yok',
  variantNoVariantsDescription: 'Montaj varyantı oluştur',
  variantNoVariantsDetail:
    'Bu proje henüz montaj varyantı tanımlamıyor. BOM çıktılarını karşılaştırmadan önce adlandırılmış bir varyant oluşturun.',
  variantCreateCommand: 'Montaj Varyantı Oluştur',
  settingsMigrationFailed:
    'KiCad Studio ayar geçişi başarısız oldu. Mevcut ayarlar son başarılı şema sürümünde bırakıldı; ayrıntılar için KiCad Studio çıktısını kontrol edin.',
  settingsMigrationUpdatedDeprecatedSettings:
    'KiCad Studio kullanımdan kaldırılan ayarları güncel şemaya güncelledi.',
  feedbackOpenFailed:
    'Geri bildirim formu otomatik olarak açılamadı. Şu adresten manuel olarak erişebilirsiniz: {url}',
  boardReadyOpsNotConfigured:
    'BoardReadyOps yapılandırılmamış. Kart hazır olma durumunu kontrol etmek için KiCad Studio ayarlarından etkinleştirin.',
  boardReadyOpsOpenSettingsAction: 'Ayarları Aç',
  boardReadyOpsRunning:
    'BoardReadyOps kontrolü sıraya alındı. Servis yanıt verdiğinde sonuçlar görünecektir.',
  boardReadyOpsReportNotAvailable:
    'Henüz BoardReadyOps raporu mevcut değil. Önce bir hazır olma kontrolü yapılandırın ve çalıştırın.',
  boardReadyOpsDocsOpenFailed:
    'BoardReadyOps belgeleri otomatik olarak açılamadı.'
};

export type SourceMessageKey = keyof typeof SOURCE_MESSAGES;

/** Detect VS Code UI locale from the environment. Falls back to 'en'. */
function getLocale(): string {
  try {
    const nlsConfig = process.env['VSCODE_NLS_CONFIG'];
    if (nlsConfig) {
      const parsed = JSON.parse(nlsConfig);
      if (parsed.locale) return parsed.locale;
    }
  } catch {
    // ignore parse errors
  }
  return 'en';
}

const currentLocale = getLocale();

export function localize(
  key: SourceMessageKey,
  args?: Record<string, string | number | boolean>
): string {
  let message =
    currentLocale === 'tr' && TR_MESSAGES[key]
      ? TR_MESSAGES[key]!
      : SOURCE_MESSAGES[key];
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      message = message.replace(`{${k}}`, String(v)) as any;
    }
  }
  return message;
}
