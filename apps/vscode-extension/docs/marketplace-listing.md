# KiCad Studio Marketplace Listing

Issue: OASLANA-115

This checklist keeps the Visual Studio Marketplace and Open VSX listing assets reviewable without relying on Marketplace-only previews.

## Manual Review Checklist

- Package metadata declares `assets/icon.png` and the dark gallery banner color in `package.json`.
- `assets/marketplace/gallery-banner-background.svg`, `assets/marketplace/gallery-banner-foreground.svg`, and `assets/marketplace/hero.svg` render locally without remote images.
- Marketplace icons exist at 128x128 and 256x256 PNG sizes.
- `assets/marketplace/core-workflow.gif` shows open project, view PCB, and run DRC in under 30 seconds and under 5 MB.
- README starts with the hero image and uses Marketplace-safe Markdown: headings, paragraphs, tables, fenced code, and images only.
- README includes Quick Start, Feature Matrix, KiCad CLI-only comparison, screenshots, MCP compatibility, and support/sponsorship sections.
- Screenshot set includes project tree, schematic viewer, PCB viewer, DRC results, and MCP Tools dashboard at 1280x720.
- English and Turkish listing copy below match the product positioning and OASLANA-106 localization work.
- Run `corepack pnpm --filter kicadstudiokit run marketplace:check` before packaging.
- Run `corepack pnpm --filter kicadstudiokit run package:validate` after packaging to confirm README assets, Marketplace assets, contribution registrations, bundle limits, and VSIX allowlist contents.

## English Listing Copy

Short description:

KiCad Studio brings KiCad project navigation, schematic and PCB review, DRC/ERC diagnostics, manufacturing handoff, and MCP-powered AI workflows into VS Code.

Long description:

KiCad Studio turns VS Code into a practical KiCad workspace for hardware teams that review boards, firmware, manufacturing outputs, and AI-assisted design context in the same repository. Open a KiCad project, inspect the project tree, view schematic and PCB files, run DRC/ERC checks, review Problems diagnostics, and connect compatible `kicad-mcp-pro` tools when you want AI workflows to understand the active design.

Highlights:

- Native project tree for KiCad projects, schematics, boards, rules, jobsets, and generated outputs.
- Schematic and PCB custom editors with KiCad CLI fallback behavior.
- DRC/ERC diagnostics surfaced through VS Code Problems, validation views, and quality gates.
- MCP Tools dashboard for compatible `kicad-mcp-pro` discovery, version gating, and AI readiness.
- Marketplace-ready docs and assets for repeatable extension packaging.

## Turkish Listing Copy

Kısa açıklama:

KiCad Studio; KiCad proje gezintisini, şematik ve PCB incelemesini, DRC/ERC tanılarını, üretim teslimini ve MCP destekli AI iş akışlarını VS Code içine getirir.

Uzun açıklama:

KiCad Studio, kart tasarımı, firmware, üretim çıktıları ve AI destekli tasarım bağlamını aynı repoda inceleyen ekipler için VS Code'u pratik bir KiCad çalışma alanına dönüştürür. Bir KiCad projesi açın, proje ağacını inceleyin, şematik ve PCB dosyalarını görüntüleyin, DRC/ERC kontrollerini çalıştırın, Problems tanılarını gözden geçirin ve AI iş akışlarının aktif tasarımı anlaması için uyumlu `kicad-mcp-pro` araçlarını bağlayın.

Öne çıkanlar:

- KiCad projeleri, şematikler, kartlar, kural dosyaları, jobset dosyaları ve üretilen çıktılar için yerel proje ağacı.
- KiCad CLI fallback davranışı olan şematik ve PCB custom editor deneyimi.
- DRC/ERC tanılarını VS Code Problems, validation view ve quality gate yüzeylerinde gösterme.
- Uyumlu `kicad-mcp-pro` keşfi, sürüm kapılama ve AI hazırlığı için MCP Tools panosu.
- Tekrarlanabilir extension paketleme için Marketplace'e hazır dokümantasyon ve asset seti.
