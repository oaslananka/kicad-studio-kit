# KiCad Studio Changelog

Source: `apps/vscode-extension/CHANGELOG.md`

All notable changes to the KiCad Studio VS Code extension will be documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this extension adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Comparison links will be added after the first public component tags are
published.

## [1.9.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.8.1...vscode-extension-v1.9.0) (2026-06-22)


### Features

* **kicad-studio:** add a Fabrication Release Wizard with validated manufacturing bundles ([#433](https://github.com/oaslananka/kicad-studio-kit/issues/433)) ([c3d366c](https://github.com/oaslananka/kicad-studio-kit/commit/c3d366c0b305364ddc4e3897c70a69c459011600))
* **kicad-studio:** add component intelligence and BOM risk scoring ([#429](https://github.com/oaslananka/kicad-studio-kit/issues/429)) ([a5cfcff](https://github.com/oaslananka/kicad-studio-kit/commit/a5cfcff425cb5df194e5cab4ce6b90fe97ae4761)), closes [#403](https://github.com/oaslananka/kicad-studio-kit/issues/403)
* **kicad-studio:** add explicit active project selection for multi-root workspaces ([#425](https://github.com/oaslananka/kicad-studio-kit/issues/425)) ([2547fc8](https://github.com/oaslananka/kicad-studio-kit/commit/2547fc8e26a28468b6594ede7905b5a3e0c23e27)), closes [#407](https://github.com/oaslananka/kicad-studio-kit/issues/407)
* **kicad-studio:** add rules-as-code policy packs for KiCad projects ([#428](https://github.com/oaslananka/kicad-studio-kit/issues/428)) ([b62f4e7](https://github.com/oaslananka/kicad-studio-kit/commit/b62f4e79014895787476d97f3631fc80ebf7eb86))
* **kicad-studio:** add structural KiCad diff report for local and PR review ([#427](https://github.com/oaslananka/kicad-studio-kit/issues/427)) ([0ce4c29](https://github.com/oaslananka/kicad-studio-kit/commit/0ce4c295b7de1a7b4f02489af43a7e926d0d3943)), closes [#401](https://github.com/oaslananka/kicad-studio-kit/issues/401)
* **kicad-studio:** document clear capability modes for assistant tools ([#436](https://github.com/oaslananka/kicad-studio-kit/issues/436)) ([4604371](https://github.com/oaslananka/kicad-studio-kit/commit/4604371913485ae2ab7909cbd940d060ea4c95b7)), closes [#406](https://github.com/oaslananka/kicad-studio-kit/issues/406)
* **kicad-studio:** premium sidebar density, status colors, and onboarding ([#447](https://github.com/oaslananka/kicad-studio-kit/issues/447)) ([e9332bf](https://github.com/oaslananka/kicad-studio-kit/commit/e9332bf8b1f23acbd5d7bc3c23b04c69fe3c9f77))
* **kicad-studio:** promote BoardReadyOps into a release readiness scorecard ([#430](https://github.com/oaslananka/kicad-studio-kit/issues/430)) ([a85896e](https://github.com/oaslananka/kicad-studio-kit/commit/a85896e3facd7b236d858fe6989a63803de7117e))


### Bug Fixes

* **kicad-studio:** default generated MCP config to least privilege ([#446](https://github.com/oaslananka/kicad-studio-kit/issues/446)) ([7647ed8](https://github.com/oaslananka/kicad-studio-kit/commit/7647ed82e15544af846f41f1efc8041b8fbafec1))
* **kicad-studio:** make sidebar MCP UX project-aware and actionable ([#445](https://github.com/oaslananka/kicad-studio-kit/issues/445)) ([46c044c](https://github.com/oaslananka/kicad-studio-kit/commit/46c044c706cb4e9e9dc5f41ef06f4edb226ea55d))


### Performance Improvements

* **kicad-studio:** debounce and cache workspace context refreshes ([#432](https://github.com/oaslananka/kicad-studio-kit/issues/432)) ([575c08f](https://github.com/oaslananka/kicad-studio-kit/commit/575c08f2b9805829232f356353639d78bb20a3bc))

## [1.8.1](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.8.0...vscode-extension-v1.8.1) (2026-06-18)


### Bug Fixes

* **kicad-studio:** drop proposed MCP API and raise engine floor to 1.101 ([#385](https://github.com/oaslananka/kicad-studio-kit/issues/385)) ([e08dd3a](https://github.com/oaslananka/kicad-studio-kit/commit/e08dd3aca373866cc84db19a6c1e46789f34a7a9))
* **kicad-studio:** tidy command palette gating and add editor context menu ([#383](https://github.com/oaslananka/kicad-studio-kit/issues/383)) ([76e94d7](https://github.com/oaslananka/kicad-studio-kit/commit/76e94d7d8a4d8726a2d269e0a6f3d05d04b96c2b))

## [1.8.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.7.0...vscode-extension-v1.8.0) (2026-06-14)


### Features

* **compat:** add release compatibility matrix ([f35ba2d](https://github.com/oaslananka/kicad-studio-kit/commit/f35ba2d34327a51890ad702cba7b188f10597a4b))
* **extension:** enrich workflow sidebars ([ba3a250](https://github.com/oaslananka/kicad-studio-kit/commit/ba3a250cebc11794997540ff8bb2971a22a97a1f))
* **extension:** polish sidebar workflow affordances ([9f41d2f](https://github.com/oaslananka/kicad-studio-kit/commit/9f41d2f996396dc72a19c1803b47a2eac3f95bf2))
* **kicad-mcp-pro:** implement empty project quality gates and ipc lifecycle transition checks ([82047b2](https://github.com/oaslananka/kicad-studio-kit/commit/82047b27629d40482bb1865560650835b8b07282))
* **kicad-studio/kicad-mcp-pro:** add doctor diagnostics ([88dca0c](https://github.com/oaslananka/kicad-studio-kit/commit/88dca0cc015a24d50b8d8b2db948783be68240ff)), closes [#74](https://github.com/oaslananka/kicad-studio-kit/issues/74)
* **kicad-studio/kicad-mcp-pro:** add KiCad IPC capability gating ([835e488](https://github.com/oaslananka/kicad-studio-kit/commit/835e48820404ad93c24b8cfd66bb68710ef2983c))
* **kicad-studio/kicad-mcp-pro:** add KiCad IPC capability gating ([c81db7a](https://github.com/oaslananka/kicad-studio-kit/commit/c81db7ac31b275be1d667d12eb61cdb96ad03cd7))
* **kicad-studio/kicad-mcp-pro:** add localization infrastructure ([49f949e](https://github.com/oaslananka/kicad-studio-kit/commit/49f949e7dc4914a8a4fc58486eca388694da1a60))
* **kicad-studio/kicad-mcp-pro:** add localization infrastructure ([fbe63e0](https://github.com/oaslananka/kicad-studio-kit/commit/fbe63e0d156e6d044cc5b515e1919b51ea86581e))
* **kicad-studio/kicad-mcp-pro:** add monorepo dev doctor ([7766750](https://github.com/oaslananka/kicad-studio-kit/commit/77667509d6ffef1e9c5779b63701b95c39433939))
* **kicad-studio/kicad-mcp-pro:** add monorepo dev doctor ([11f2168](https://github.com/oaslananka/kicad-studio-kit/commit/11f2168c9482daeceff89f74806b21697d4fc9df))
* **kicad-studio/kicad-mcp-pro:** add operating modes ([2cd849a](https://github.com/oaslananka/kicad-studio-kit/commit/2cd849a050e0119cd9ec7bb02463b3e37ff0a35a)), closes [#73](https://github.com/oaslananka/kicad-studio-kit/issues/73)
* **kicad-studio/kicad-mcp-pro:** add opt-in privacy-safe reporting ([55ca498](https://github.com/oaslananka/kicad-studio-kit/commit/55ca498d881d30cb725e532b6200bccefe3662e0))
* **kicad-studio/kicad-mcp-pro:** add opt-in privacy-safe reporting ([4d0e902](https://github.com/oaslananka/kicad-studio-kit/commit/4d0e902d938fa196a9d9c4c4468c918f7205b2b7))
* **kicad-studio/kicad-mcp-pro:** add product release provenance evidence ([#195](https://github.com/oaslananka/kicad-studio-kit/issues/195)) ([e2caccd](https://github.com/oaslananka/kicad-studio-kit/commit/e2caccd5663e394585b017554305ef0954b62d66))
* **kicad-studio/kicad-mcp-pro:** add shared protocol schemas package ([684ef9f](https://github.com/oaslananka/kicad-studio-kit/commit/684ef9fd9b8363914120a7228fa8cbf82e65d4db)), closes [#53](https://github.com/oaslananka/kicad-studio-kit/issues/53)
* **kicad-studio/kicad-mcp-pro:** add STEPZ and XAO exports ([b098507](https://github.com/oaslananka/kicad-studio-kit/commit/b098507762c456a875a4525108ab7eea58a60172)), closes [#232](https://github.com/oaslananka/kicad-studio-kit/issues/232)
* **kicad-studio/kicad-mcp-pro:** implement empty project onboarding quality gates and ipc lifecycle transition checks ([0627370](https://github.com/oaslananka/kicad-studio-kit/commit/06273709440056e9bcdf76d339f84d1829097edb))
* **kicad-studio:** 9 new export formats, v1.4.1 alignment, manifest check script ([c9085cb](https://github.com/oaslananka/kicad-studio-kit/commit/c9085cbb8f9f73212cee59372c7ebf18077fd0de))
* **kicad-studio:** add .kicad_prl and .kicad_wks language support ([#313](https://github.com/oaslananka/kicad-studio-kit/issues/313)) ([b95391d](https://github.com/oaslananka/kicad-studio-kit/commit/b95391d03f0b1f8cc68a59b1cfb7839bf65fe1cb))
* **kicad-studio:** add AI provider secret vault ([4097f3f](https://github.com/oaslananka/kicad-studio-kit/commit/4097f3feb06292eda1d6cc5c56747ccaf5d99830))
* **kicad-studio:** add AI provider secret vault ([22d9143](https://github.com/oaslananka/kicad-studio-kit/commit/22d9143730bad89ec3aea3975017bd39630997a8))
* **kicad-studio:** add BoardReadyOps command stubs ([#271](https://github.com/oaslananka/kicad-studio-kit/issues/271)) ([6ee4e61](https://github.com/oaslananka/kicad-studio-kit/commit/6ee4e61f07f86e35644b5dfc7032ecf247e4d4f1))
* **kicad-studio:** add diagnostic freshness model ([60baed9](https://github.com/oaslananka/kicad-studio-kit/commit/60baed9acc73a58c7adfa5884126cb5fcf8fc496))
* **kicad-studio:** add inline component search view ([e40622c](https://github.com/oaslananka/kicad-studio-kit/commit/e40622c13123679880eb595b2a8f5685cb168ad2))
* **kicad-studio:** add inline component search view ([9b36be1](https://github.com/oaslananka/kicad-studio-kit/commit/9b36be1039a8617ed2678a4a4a8211e6c67ffef4))
* **kicad-studio:** add MCP compatibility dashboard ([f0a2adb](https://github.com/oaslananka/kicad-studio-kit/commit/f0a2adb4f6200257e20ad865ebba1d843ca11092))
* **kicad-studio:** add MCP compatibility dashboard ([004e488](https://github.com/oaslananka/kicad-studio-kit/commit/004e4887ad31949a365523ba379c3ec15261ade1))
* **kicad-studio:** add PCM library management ([fdd5323](https://github.com/oaslananka/kicad-studio-kit/commit/fdd5323b69a757aef1382995c74f8d10c4848acf))
* **kicad-studio:** add PCM library management ([4df04e3](https://github.com/oaslananka/kicad-studio-kit/commit/4df04e39fde4f43204faa864a3e6b44db7980797))
* **kicad-studio:** add pre-commit hooks, VSIX tag build, coverage PR comment, E2E in CI ([#312](https://github.com/oaslananka/kicad-studio-kit/issues/312)) ([edc1b0b](https://github.com/oaslananka/kicad-studio-kit/commit/edc1b0b2f65933ab21991c2d3e8791d9bc623df8))
* **kicad-studio:** add settings migration framework ([1fbbe7f](https://github.com/oaslananka/kicad-studio-kit/commit/1fbbe7f6df0c66483c2ffc74b4c29486396fda27))
* **kicad-studio:** add settings migration framework ([239755b](https://github.com/oaslananka/kicad-studio-kit/commit/239755be6a4102c05fef59b9929fc9de793f71d3))
* **kicad-studio:** add SPICE/Gerber/Drill/Worksheet grammars, update DRC with KiCad 10+ constraints ([f25bf7a](https://github.com/oaslananka/kicad-studio-kit/commit/f25bf7afa7dc913ec1e77fd94823cab1c5dc8272))
* **kicad-studio:** add Turkish (tr) localization ([6e6bc09](https://github.com/oaslananka/kicad-studio-kit/commit/6e6bc098ec24098597f2dbc6776e5e35111e850a))
* **kicad-studio:** add viewer engine state ([633fc29](https://github.com/oaslananka/kicad-studio-kit/commit/633fc297bbf37fba6acb5610f0b28238890519a7))
* **kicad-studio:** add viewer engine state ([7138bf9](https://github.com/oaslananka/kicad-studio-kit/commit/7138bf9203820a76e14f596aa2bc4a63e894d56d))
* **kicad-studio:** complete prompt spec - Phase A-E, screenshots, manifest, CI gates, security hardening ([a43e305](https://github.com/oaslananka/kicad-studio-kit/commit/a43e30505ca8151c312cf4047396a0d1e796fe93))
* **kicad-studio:** downgrade vscode engine and improve mcp sidebar UX ([#316](https://github.com/oaslananka/kicad-studio-kit/issues/316)) ([257019b](https://github.com/oaslananka/kicad-studio-kit/commit/257019b417a5889b7196936ee84f3d562b43f2cd))
* **kicad-studio:** gate Allegro import workflow ([eac6edc](https://github.com/oaslananka/kicad-studio-kit/commit/eac6edc20628e882f55698c6684ba8b8dba40a2b))
* **kicad-studio:** gate Allegro import workflow ([f1bf39b](https://github.com/oaslananka/kicad-studio-kit/commit/f1bf39b9834d87c298cd3d90d8d6915dd2536c48))
* **kicad-studio:** isolate multi-project workspace state ([26124d7](https://github.com/oaslananka/kicad-studio-kit/commit/26124d719a0330ef3ef90afe034a22f115c21f5f))
* **kicad-studio:** isolate multi-project workspace state ([96cb313](https://github.com/oaslananka/kicad-studio-kit/commit/96cb313479aafb9c3b4d08c4cf2ad48c82ae9fbe))
* **kicad-studio:** surface KiCad support matrix ([5dbdee8](https://github.com/oaslananka/kicad-studio-kit/commit/5dbdee8b54f470c6a1cba0ca0254c9940e22625a))
* **mcp:** add BoardReadyOps tree node and fix TS errors in mcpToolsProvider ([3c566b7](https://github.com/oaslananka/kicad-studio-kit/commit/3c566b744e31ff2ec963e201963f01360cc44026))
* **mcp:** add server info capabilities contract ([759ef3a](https://github.com/oaslananka/kicad-studio-kit/commit/759ef3ae7c18d6c0f87eb1049ccc80d743eb3bc9))
* **repo:** add shared kicad fixtures package ([a858483](https://github.com/oaslananka/kicad-studio-kit/commit/a8584830316c5d9fc0386e1877eaa18c026022ef)), closes [#54](https://github.com/oaslananka/kicad-studio-kit/issues/54)
* **repo:** establish beta feedback program ([3d49ce9](https://github.com/oaslananka/kicad-studio-kit/commit/3d49ce99adab11bb1d7e959fb0591ced9d9f2557))
* **repo:** establish beta feedback program ([7723d43](https://github.com/oaslananka/kicad-studio-kit/commit/7723d4328d43ecffed8d42ce12cd48a8ad63835b))
* **repo:** remove packages/mcp-npm from monorepo ([#286](https://github.com/oaslananka/kicad-studio-kit/issues/286) Phase 2, PR 3) ([3231265](https://github.com/oaslananka/kicad-studio-kit/commit/3231265e62342d7f2b25f655f74a9475f5d79ea9))
* **studio:** add mcp tool adapter layer ([73acdc0](https://github.com/oaslananka/kicad-studio-kit/commit/73acdc09827fd18261581cb6af686b73619f91dd))
* **studio:** centralize extension state stores ([76eb2cd](https://github.com/oaslananka/kicad-studio-kit/commit/76eb2cd31778bebeb255dbfd07e3139b99eff596)), closes [#69](https://github.com/oaslananka/kicad-studio-kit/issues/69)
* **vscode-extension:** integrate real BoardReadyOps check command ([#311](https://github.com/oaslananka/kicad-studio-kit/issues/311)) ([4237063](https://github.com/oaslananka/kicad-studio-kit/commit/4237063b342677dbdde1ff0469bfdc67b5186006))


### Bug Fixes

* **extension:** clear stale diagnostics by canonical path ([30d91ea](https://github.com/oaslananka/kicad-studio-kit/commit/30d91ea46922d045a2756ea9aec697b966466ec6))
* keep release preparation checks stable ([66123b7](https://github.com/oaslananka/kicad-studio-kit/commit/66123b7f1b10e6c4cdf81291aaecfa7a6fb0682a))
* **kicad-studio/kicad-mcp-pro:** mark KiCad 9.x deprecated ([11fb19a](https://github.com/oaslananka/kicad-studio-kit/commit/11fb19a6aceb7932fd200077bc97082c725f61fb))
* **kicad-studio/kicad-mcp-pro:** mark KiCad 9.x deprecated ([11fb19a](https://github.com/oaslananka/kicad-studio-kit/commit/11fb19a6aceb7932fd200077bc97082c725f61fb))
* **kicad-studio/kicad-mcp-pro:** mark KiCad 9.x deprecated ([c421156](https://github.com/oaslananka/kicad-studio-kit/commit/c42115697dab897d2bbc9ae5fb20853ebf62cf04))
* **kicad-studio/kicad-mcp-pro:** raise public compatibility floors ([98283a7](https://github.com/oaslananka/kicad-studio-kit/commit/98283a7374fcd666c392044e95aafb0c330d896e)), closes [#209](https://github.com/oaslananka/kicad-studio-kit/issues/209)
* **kicad-studio/kicad-mcp-pro:** reset extension marketplace identity ([2f907a1](https://github.com/oaslananka/kicad-studio-kit/commit/2f907a14c9b28b8d9c80f6581409f24ed53e66d0))
* **kicad-studio/kicad-mcp-pro:** reset extension marketplace identity ([11f3fd0](https://github.com/oaslananka/kicad-studio-kit/commit/11f3fd0e99bdaf761e99dc733a9a8b8c26fc403f))
* **kicad-studio:** address 6 Gemini code review issues ([aed0572](https://github.com/oaslananka/kicad-studio-kit/commit/aed0572453c3cdcb9223742ebbb97cd8df6b6d47))
* **kicad-studio:** address accessibility review feedback ([0cc0f69](https://github.com/oaslananka/kicad-studio-kit/commit/0cc0f692382c4cda599eea34979fb8d987f87b62))
* **kicad-studio:** address component search review feedback ([561d83f](https://github.com/oaslananka/kicad-studio-kit/commit/561d83ff33cf0c4f41e3f044301fc232f8f8fa06))
* **kicad-studio:** AI Chat scroll anchoring and long-response rendering jank ([#264](https://github.com/oaslananka/kicad-studio-kit/issues/264)) ([bff52bb](https://github.com/oaslananka/kicad-studio-kit/commit/bff52bb45edd5144ede9affec9ebc300762e13c5))
* **kicad-studio:** align Codex provider support ([484f739](https://github.com/oaslananka/kicad-studio-kit/commit/484f739ce3e77ae4682a8577553ee963d1cdd268))
* **kicad-studio:** align marketplace version checks ([39fb2f9](https://github.com/oaslananka/kicad-studio-kit/commit/39fb2f916fe6f12d2927be34972e62319b1f263c)), closes [#320](https://github.com/oaslananka/kicad-studio-kit/issues/320)
* **kicad-studio:** align viewer toolbar with VS Code themes ([80f1d5c](https://github.com/oaslananka/kicad-studio-kit/commit/80f1d5c20ccea670e949ebccd2f7274a5b325ebc)), closes [#18](https://github.com/oaslananka/kicad-studio-kit/issues/18)
* **kicad-studio:** clarify project tree roles ([f6f5a2f](https://github.com/oaslananka/kicad-studio-kit/commit/f6f5a2f91ec8394f3ef0f7e3d4144a33c442a5aa)), closes [#21](https://github.com/oaslananka/kicad-studio-kit/issues/21)
* **kicad-studio:** compact viewer tools panel ([#156](https://github.com/oaslananka/kicad-studio-kit/issues/156)) ([3270fb4](https://github.com/oaslananka/kicad-studio-kit/commit/3270fb47920481e5baa732c78334022cdf2fdf81))
* **kicad-studio:** declare mcpConfigurationProvider in enabledApiProposals ([#333](https://github.com/oaslananka/kicad-studio-kit/issues/333)) ([4f1018e](https://github.com/oaslananka/kicad-studio-kit/commit/4f1018ed3ac7592a0cc334b814c88b22ced42a1b))
* **kicad-studio:** escape PCM library table backslashes ([19254b5](https://github.com/oaslananka/kicad-studio-kit/commit/19254b51290ef480fae9b9e3530ab3b80d3e07d1))
* **kicad-studio:** fail closed on import support probes ([0cbbb0d](https://github.com/oaslananka/kicad-studio-kit/commit/0cbbb0d20e63ad1fd695077d0206c89925f1ea66))
* **kicad-studio:** let fallback viewer fit schematic ([edd71e7](https://github.com/oaslananka/kicad-studio-kit/commit/edd71e74159308302163f274590420696dd10a79)), closes [#17](https://github.com/oaslananka/kicad-studio-kit/issues/17)
* **kicad-studio:** polish sidebar workflow states ([78ad7dc](https://github.com/oaslananka/kicad-studio-kit/commit/78ad7dce44ca912984203475a127a32df8045735))
* **kicad-studio:** repair extension listing media links and stale version text ([#261](https://github.com/oaslananka/kicad-studio-kit/issues/261)) ([5527985](https://github.com/oaslananka/kicad-studio-kit/commit/5527985ea7956711ffd91a514d6e18e9da2377c9))
* **kicad-studio:** resolve vscode extension runtime UI and degraded MCP bugs ([4167232](https://github.com/oaslananka/kicad-studio-kit/commit/4167232ebfc8a7b5160ac627a5ec57f673f25980))
* **kicad-studio:** Runtime UI and MCP degraded-mode handling ([#250](https://github.com/oaslananka/kicad-studio-kit/issues/250), [#249](https://github.com/oaslananka/kicad-studio-kit/issues/249)) ([#255](https://github.com/oaslananka/kicad-studio-kit/issues/255)) ([feacf6b](https://github.com/oaslananka/kicad-studio-kit/commit/feacf6ba24a79f7cccde22a691422d8958ed77ab))
* **kicad-studio:** separate quality gates docs links from executable gate actions ([#263](https://github.com/oaslananka/kicad-studio-kit/issues/263)) ([7aed494](https://github.com/oaslananka/kicad-studio-kit/commit/7aed49456aea85a010eaea9b019594b437267118))
* make extension formatting portable ([a64af89](https://github.com/oaslananka/kicad-studio-kit/commit/a64af89c4aefeba3c5f6664f660b617234d9a71c))
* **repo:** address beta program review feedback ([521aef0](https://github.com/oaslananka/kicad-studio-kit/commit/521aef069c36f67617df591fc1fe5374c8014d56))
* **repo:** align displayName with Marketplace listing (KiCad Studio Kit) ([939654a](https://github.com/oaslananka/kicad-studio-kit/commit/939654abb064a5c6623a91cff91d6721f1316502))
* **repo:** align runtime support policy ([#305](https://github.com/oaslananka/kicad-studio-kit/issues/305)) ([f09e9ae](https://github.com/oaslananka/kicad-studio-kit/commit/f09e9ae81611cd519a49111789fdee92f5fdb9e1))
* **repo:** align sub-package pnpm version policy ([#284](https://github.com/oaslananka/kicad-studio-kit/issues/284)) ([238664e](https://github.com/oaslananka/kicad-studio-kit/commit/238664e361eda53875bd65291c9f379d1581397c))
* **repo:** remove packages/mcp-server from monorepo (moved to oaslananka/kicad-mcp) ([#303](https://github.com/oaslananka/kicad-studio-kit/issues/303)) ([59c9716](https://github.com/oaslananka/kicad-studio-kit/commit/59c971605bc2e4451a622276a992af8d4f5a5fcc))
* **repo:** trigger fresh CI ([483ab04](https://github.com/oaslananka/kicad-studio-kit/commit/483ab043b6fed6314734c23d14a024249e116376))
* **repo:** use import.meta.resolve instead of require.resolve in ESM docs script ([9714e60](https://github.com/oaslananka/kicad-studio-kit/commit/9714e60b39d812d940ca327d48c6b5e9cef6d9d9))
* **repo:** verify registry VSIX payload content ([#345](https://github.com/oaslananka/kicad-studio-kit/issues/345)) ([9307179](https://github.com/oaslananka/kicad-studio-kit/commit/930717970288c03dfc60bca1bddb51efd67a5b0d)), closes [#344](https://github.com/oaslananka/kicad-studio-kit/issues/344)
* **security:** make python audit gate deterministic ([5350ec8](https://github.com/oaslananka/kicad-studio-kit/commit/5350ec818e1b8d9c1a17aeec744a612a50c73044))

## [1.7.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.6.2...vscode-extension-v1.7.0) (2026-06-14)

### Features

- **kicad-studio:** add Turkish (tr) localization ([6e6bc09](https://github.com/oaslananka/kicad-studio-kit/commit/6e6bc09eb5301503fd6c4ad1de857a43a1c02967))

### Bug Fixes

- **kicad-studio:** add --allow-all-proposed-apis to vsce publish command ([d587d63](https://github.com/oaslananka/kicad-studio-kit/commit/d587d635f4f6e04405e2f988a2145e39e1e2c29e))
- **kicad-studio:** trigger publish-extension after release ([ca6319d](https://github.com/oaslananka/kicad-studio-kit/commit/ca6319dec63aa2debc68dcdd91b275a7b5290bb0))
- **kicad-studio:** clean up workflow and script dead references, auto-generate docs after release ([9005d14](https://github.com/oaslananka/kicad-studio-kit/commit/9005d1498e4e82f58e14e77d78f975b1371e52f6))
- **repo:** verify registry VSIX payload content ([#345](https://github.com/oaslananka/kicad-studio-kit/issues/345)) ([9307179](https://github.com/oaslananka/kicad-studio-kit/commit/9307179bf4431f450a7a7f9a7d14b9e88d00a779))
- **repo:** harden release publishing and evidence recovery ([#343](https://github.com/oaslananka/kicad-studio-kit/issues/343)) ([6fe3fd7](https://github.com/oaslananka/kicad-studio-kit/commit/6fe3fd71ad7b90cd5cf2572061eabfd60823ab52))

### Miscellaneous Chores

- **repo:** apply fleet standards ([be4eac3](https://github.com/oaslananka/kicad-studio-kit/commit/be4eac34e4a6e459fa6c0cc5f6f43521aed628a1))
- **repo:** complete fleet audit remediation ([8f90735](https://github.com/oaslananka/kicad-studio-kit/commit/8f907351a74ce6df61755adb4a6255777a2311e9))

### Tests

- **kicad-studio:** raise coverage thresholds and add mcpClient per-file gate ([621a0cf](https://github.com/oaslananka/kicad-studio-kit/commit/621a0cf4ce448c10cb7009d3c23c57d8ceb1a1c6))

## [1.6.2](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.6.1...vscode-extension-v1.6.2) (2026-06-09)

### Bug Fixes

- **kicad-studio:** declare mcpConfigurationProvider in enabledApiProposals ([#333](https://github.com/oaslananka/kicad-studio-kit/issues/333)) ([4f1018e](https://github.com/oaslananka/kicad-studio-kit/commit/4f1018ed3ac7592a0cc334b814c88b22ced42a1b))

## [1.6.1](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.6.0...vscode-extension-v1.6.1) (2026-06-07)

### Bug Fixes

- **repo:** trigger fresh CI ([483ab04](https://github.com/oaslananka/kicad-studio-kit/commit/483ab043b6fed6314734c23d14a024249e116376))

## [1.6.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.5.0...vscode-extension-v1.6.0) (2026-06-07)

### Features

- **kicad-studio:** complete prompt spec - Phase A-E, screenshots, manifest, CI gates, security hardening ([a43e305](https://github.com/oaslananka/kicad-studio-kit/commit/a43e30505ca8151c312cf4047396a0d1e796fe93))

### Bug Fixes

- **kicad-studio:** address 6 Gemini code review issues ([aed0572](https://github.com/oaslananka/kicad-studio-kit/commit/aed0572453c3cdcb9223742ebbb97cd8df6b6d47))

## [1.5.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.4.1...vscode-extension-v1.5.0) (2026-06-06)

### Features

- **kicad-studio:** 9 new export formats, v1.4.1 alignment, manifest check script ([c9085cb](https://github.com/oaslananka/kicad-studio-kit/commit/c9085cbb8f9f73212cee59372c7ebf18077fd0de))

## [1.4.1](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.4.0...vscode-extension-v1.4.1) (2026-06-05)

### Bug Fixes

- **kicad-studio:** align marketplace version checks ([39fb2f9](https://github.com/oaslananka/kicad-studio-kit/commit/39fb2f916fe6f12d2927be34972e62319b1f263c)), closes [#320](https://github.com/oaslananka/kicad-studio-kit/issues/320)

## [1.4.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.3.0...vscode-extension-v1.4.0) (2026-06-04)

### Features

- **kicad-studio:** downgrade vscode engine and improve mcp sidebar UX ([#316](https://github.com/oaslananka/kicad-studio-kit/issues/316)) ([257019b](https://github.com/oaslananka/kicad-studio-kit/commit/257019b417a5889b7196936ee84f3d562b43f2cd))

## [1.3.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.2.0...vscode-extension-v1.3.0) (2026-06-04)

### Features

- **kicad-studio:** add .kicad_prl and .kicad_wks language support ([#313](https://github.com/oaslananka/kicad-studio-kit/issues/313)) ([b95391d](https://github.com/oaslananka/kicad-studio-kit/commit/b95391d03f0b1f8cc68a59b1cfb7839bf65fe1cb))
- **kicad-studio:** add SPICE/Gerber/Drill/Worksheet grammars, update DRC with KiCad 10+ constraints ([f25bf7a](https://github.com/oaslananka/kicad-studio-kit/commit/f25bf7afa7dc913ec1e77fd94823cab1c5dc8272))

### Bug Fixes

- **repo:** align displayName with Marketplace listing (KiCad Studio Kit) ([939654a](https://github.com/oaslananka/kicad-studio-kit/commit/939654abb064a5c6623a91cff91d6721f1316502))

## [1.1.0](https://github.com/oaslananka/kicad-studio-kit/compare/vscode-extension-v1.0.0...vscode-extension-v1.1.0) (2026-05-27)

### Features

- **compat:** add release compatibility matrix ([f35ba2d](https://github.com/oaslananka/kicad-studio-kit/commit/f35ba2d34327a51890ad702cba7b188f10597a4b))
- **extension:** enrich workflow sidebars ([ba3a250](https://github.com/oaslananka/kicad-studio-kit/commit/ba3a250cebc11794997540ff8bb2971a22a97a1f))
- **extension:** polish sidebar workflow affordances ([9f41d2f](https://github.com/oaslananka/kicad-studio-kit/commit/9f41d2f996396dc72a19c1803b47a2eac3f95bf2))
- **kicad-studio/kicad-mcp-pro:** add doctor diagnostics ([88dca0c](https://github.com/oaslananka/kicad-studio-kit/commit/88dca0cc015a24d50b8d8b2db948783be68240ff)), closes [#74](https://github.com/oaslananka/kicad-studio-kit/issues/74)
- **kicad-studio/kicad-mcp-pro:** add KiCad IPC capability gating ([835e488](https://github.com/oaslananka/kicad-studio-kit/commit/835e48820404ad93c24b8cfd66bb68710ef2983c))
- **kicad-studio/kicad-mcp-pro:** add KiCad IPC capability gating ([c81db7a](https://github.com/oaslananka/kicad-studio-kit/commit/c81db7ac31b275be1d667d12eb61cdb96ad03cd7))
- **kicad-studio/kicad-mcp-pro:** add localization infrastructure ([49f949e](https://github.com/oaslananka/kicad-studio-kit/commit/49f949e7dc4914a8a4fc58486eca388694da1a60))
- **kicad-studio/kicad-mcp-pro:** add localization infrastructure ([fbe63e0](https://github.com/oaslananka/kicad-studio-kit/commit/fbe63e0d156e6d044cc5b515e1919b51ea86581e))
- **kicad-studio/kicad-mcp-pro:** add monorepo dev doctor ([7766750](https://github.com/oaslananka/kicad-studio-kit/commit/77667509d6ffef1e9c5779b63701b95c39433939))
- **kicad-studio/kicad-mcp-pro:** add monorepo dev doctor ([11f2168](https://github.com/oaslananka/kicad-studio-kit/commit/11f2168c9482daeceff89f74806b21697d4fc9df))
- **kicad-studio/kicad-mcp-pro:** add operating modes ([2cd849a](https://github.com/oaslananka/kicad-studio-kit/commit/2cd849a050e0119cd9ec7bb02463b3e37ff0a35a)), closes [#73](https://github.com/oaslananka/kicad-studio-kit/issues/73)
- **kicad-studio/kicad-mcp-pro:** add opt-in privacy-safe reporting ([55ca498](https://github.com/oaslananka/kicad-studio-kit/commit/55ca498d881d30cb725e532b6200bccefe3662e0))
- **kicad-studio/kicad-mcp-pro:** add opt-in privacy-safe reporting ([4d0e902](https://github.com/oaslananka/kicad-studio-kit/commit/4d0e902d938fa196a9d9c4c4468c918f7205b2b7))
- **kicad-studio/kicad-mcp-pro:** add product release provenance evidence ([#195](https://github.com/oaslananka/kicad-studio-kit/issues/195)) ([e2caccd](https://github.com/oaslananka/kicad-studio-kit/commit/e2caccd5663e394585b017554305ef0954b62d66))
- **kicad-studio/kicad-mcp-pro:** add shared protocol schemas package ([684ef9f](https://github.com/oaslananka/kicad-studio-kit/commit/684ef9fd9b8363914120a7228fa8cbf82e65d4db)), closes [#53](https://github.com/oaslananka/kicad-studio-kit/issues/53)
- **kicad-studio/kicad-mcp-pro:** add STEPZ and XAO exports ([b098507](https://github.com/oaslananka/kicad-studio-kit/commit/b098507762c456a875a4525108ab7eea58a60172)), closes [#232](https://github.com/oaslananka/kicad-studio-kit/issues/232)
- **kicad-studio:** add AI provider secret vault ([4097f3f](https://github.com/oaslananka/kicad-studio-kit/commit/4097f3feb06292eda1d6cc5c56747ccaf5d99830))
- **kicad-studio:** add AI provider secret vault ([22d9143](https://github.com/oaslananka/kicad-studio-kit/commit/22d9143730bad89ec3aea3975017bd39630997a8))
- **kicad-studio:** add diagnostic freshness model ([60baed9](https://github.com/oaslananka/kicad-studio-kit/commit/60baed9acc73a58c7adfa5884126cb5fcf8fc496))
- **kicad-studio:** add inline component search view ([e40622c](https://github.com/oaslananka/kicad-studio-kit/commit/e40622c13123679880eb595b2a8f5685cb168ad2))
- **kicad-studio:** add inline component search view ([9b36be1](https://github.com/oaslananka/kicad-studio-kit/commit/9b36be1039a8617ed2678a4a4a8211e6c67ffef4))
- **kicad-studio:** add MCP compatibility dashboard ([f0a2adb](https://github.com/oaslananka/kicad-studio-kit/commit/f0a2adb4f6200257e20ad865ebba1d843ca11092))
- **kicad-studio:** add MCP compatibility dashboard ([004e488](https://github.com/oaslananka/kicad-studio-kit/commit/004e4887ad31949a365523ba379c3ec15261ade1))
- **kicad-studio:** add PCM library management ([fdd5323](https://github.com/oaslananka/kicad-studio-kit/commit/fdd5323b69a757aef1382995c74f8d10c4848acf))
- **kicad-studio:** add PCM library management ([4df04e3](https://github.com/oaslananka/kicad-studio-kit/commit/4df04e39fde4f43204faa864a3e6b44db7980797))
- **kicad-studio:** add settings migration framework ([1fbbe7f](https://github.com/oaslananka/kicad-studio-kit/commit/1fbbe7f6df0c66483c2ffc74b4c29486396fda27))
- **kicad-studio:** add settings migration framework ([239755b](https://github.com/oaslananka/kicad-studio-kit/commit/239755be6a4102c05fef59b9929fc9de793f71d3))
- **kicad-studio:** add viewer engine state ([633fc29](https://github.com/oaslananka/kicad-studio-kit/commit/633fc297bbf37fba6acb5610f0b28238890519a7))
- **kicad-studio:** add viewer engine state ([7138bf9](https://github.com/oaslananka/kicad-studio-kit/commit/7138bf9203820a76e14f596aa2bc4a63e894d56d))
- **kicad-studio:** gate Allegro import workflow ([eac6edc](https://github.com/oaslananka/kicad-studio-kit/commit/eac6edc20628e882f55698c6684ba8b8dba40a2b))
- **kicad-studio:** gate Allegro import workflow ([f1bf39b](https://github.com/oaslananka/kicad-studio-kit/commit/f1bf39b9834d87c298cd3d90d8d6915dd2536c48))
- **kicad-studio:** isolate multi-project workspace state ([26124d7](https://github.com/oaslananka/kicad-studio-kit/commit/26124d719a0330ef3ef90afe034a22f115c21f5f))
- **kicad-studio:** isolate multi-project workspace state ([96cb313](https://github.com/oaslananka/kicad-studio-kit/commit/96cb313479aafb9c3b4d08c4cf2ad48c82ae9fbe))
- **kicad-studio:** surface KiCad support matrix ([5dbdee8](https://github.com/oaslananka/kicad-studio-kit/commit/5dbdee8b54f470c6a1cba0ca0254c9940e22625a))
- **mcp:** add server info capabilities contract ([759ef3a](https://github.com/oaslananka/kicad-studio-kit/commit/759ef3ae7c18d6c0f87eb1049ccc80d743eb3bc9))
- **repo:** add shared kicad fixtures package ([a858483](https://github.com/oaslananka/kicad-studio-kit/commit/a8584830316c5d9fc0386e1877eaa18c026022ef)), closes [#54](https://github.com/oaslananka/kicad-studio-kit/issues/54)
- **repo:** establish beta feedback program ([3d49ce9](https://github.com/oaslananka/kicad-studio-kit/commit/3d49ce99adab11bb1d7e959fb0591ced9d9f2557))
- **repo:** establish beta feedback program ([7723d43](https://github.com/oaslananka/kicad-studio-kit/commit/7723d4328d43ecffed8d42ce12cd48a8ad63835b))
- **studio:** add mcp tool adapter layer ([73acdc0](https://github.com/oaslananka/kicad-studio-kit/commit/73acdc09827fd18261581cb6af686b73619f91dd))
- **studio:** centralize extension state stores ([76eb2cd](https://github.com/oaslananka/kicad-studio-kit/commit/76eb2cd31778bebeb255dbfd07e3139b99eff596)), closes [#69](https://github.com/oaslananka/kicad-studio-kit/issues/69)

### Bug Fixes

- **extension:** clear stale diagnostics by canonical path ([30d91ea](https://github.com/oaslananka/kicad-studio-kit/commit/30d91ea46922d045a2756ea9aec697b966466ec6))
- keep release preparation checks stable ([66123b7](https://github.com/oaslananka/kicad-studio-kit/commit/66123b7f1b10e6c4cdf81291aaecfa7a6fb0682a))
- **kicad-studio/kicad-mcp-pro:** mark KiCad 9.x deprecated ([11fb19a](https://github.com/oaslananka/kicad-studio-kit/commit/11fb19a6aceb7932fd200077bc97082c725f61fb))
- **kicad-studio/kicad-mcp-pro:** mark KiCad 9.x deprecated ([11fb19a](https://github.com/oaslananka/kicad-studio-kit/commit/11fb19a6aceb7932fd200077bc97082c725f61fb))
- **kicad-studio/kicad-mcp-pro:** mark KiCad 9.x deprecated ([c421156](https://github.com/oaslananka/kicad-studio-kit/commit/c42115697dab897d2bbc9ae5fb20853ebf62cf04))
- **kicad-studio/kicad-mcp-pro:** raise public compatibility floors ([98283a7](https://github.com/oaslananka/kicad-studio-kit/commit/98283a7374fcd666c392044e95aafb0c330d896e)), closes [#209](https://github.com/oaslananka/kicad-studio-kit/issues/209)
- **kicad-studio/kicad-mcp-pro:** reset extension marketplace identity ([2f907a1](https://github.com/oaslananka/kicad-studio-kit/commit/2f907a14c9b28b8d9c80f6581409f24ed53e66d0))
- **kicad-studio/kicad-mcp-pro:** reset extension marketplace identity ([11f3fd0](https://github.com/oaslananka/kicad-studio-kit/commit/11f3fd0e99bdaf761e99dc733a9a8b8c26fc403f))
- **kicad-studio:** address accessibility review feedback ([0cc0f69](https://github.com/oaslananka/kicad-studio-kit/commit/0cc0f692382c4cda599eea34979fb8d987f87b62))
- **kicad-studio:** address component search review feedback ([561d83f](https://github.com/oaslananka/kicad-studio-kit/commit/561d83ff33cf0c4f41e3f044301fc232f8f8fa06))
- **kicad-studio:** align Codex provider support ([484f739](https://github.com/oaslananka/kicad-studio-kit/commit/484f739ce3e77ae4682a8577553ee963d1cdd268))
- **kicad-studio:** align viewer toolbar with VS Code themes ([80f1d5c](https://github.com/oaslananka/kicad-studio-kit/commit/80f1d5c20ccea670e949ebccd2f7274a5b325ebc)), closes [#18](https://github.com/oaslananka/kicad-studio-kit/issues/18)
- **kicad-studio:** clarify project tree roles ([f6f5a2f](https://github.com/oaslananka/kicad-studio-kit/commit/f6f5a2f91ec8394f3ef0f7e3d4144a33c442a5aa)), closes [#21](https://github.com/oaslananka/kicad-studio-kit/issues/21)
- **kicad-studio:** compact viewer tools panel ([#156](https://github.com/oaslananka/kicad-studio-kit/issues/156)) ([3270fb4](https://github.com/oaslananka/kicad-studio-kit/commit/3270fb47920481e5baa732c78334022cdf2fdf81))
- **kicad-studio:** escape PCM library table backslashes ([19254b5](https://github.com/oaslananka/kicad-studio-kit/commit/19254b51290ef480fae9b9e3530ab3b80d3e07d1))
- **kicad-studio:** fail closed on import support probes ([0cbbb0d](https://github.com/oaslananka/kicad-studio-kit/commit/0cbbb0d20e63ad1fd695077d0206c89925f1ea66))
- **kicad-studio:** let fallback viewer fit schematic ([edd71e7](https://github.com/oaslananka/kicad-studio-kit/commit/edd71e74159308302163f274590420696dd10a79)), closes [#17](https://github.com/oaslananka/kicad-studio-kit/issues/17)
- **kicad-studio:** polish sidebar workflow states ([78ad7dc](https://github.com/oaslananka/kicad-studio-kit/commit/78ad7dce44ca912984203475a127a32df8045735))
- make extension formatting portable ([a64af89](https://github.com/oaslananka/kicad-studio-kit/commit/a64af89c4aefeba3c5f6664f660b617234d9a71c))
- **repo:** address beta program review feedback ([521aef0](https://github.com/oaslananka/kicad-studio-kit/commit/521aef069c36f67617df591fc1fe5374c8014d56))
- **security:** make python audit gate deterministic ([5350ec8](https://github.com/oaslananka/kicad-studio-kit/commit/5350ec818e1b8d9c1a17aeec744a612a50c73044))

## [Unreleased]

### Added

- **CLI capability metadata registry**: Centralized `CLI_CAPABILITY_METADATA`
  table covering all 35 CLI commands with category, minimum version, and
  human-readable description; snapshot expanded from 11 to 26 probed commands
  with `commandMinVersion` / `commandVersionStatus` fields.
- **Extended feature support**: 7 new capability-gated features — 3D exports,
  2D schematic exports, 2D PCB exports, manufacturing formats, pick-and-place,
  footprint/symbol exports, and PCB import — with per-feature version checks.
- **Import auto-detect format**: Added `auto` format to PCB import list; CLI
  `--format` is omitted when auto mode is active, and a dedicated
  `kicadstudio.importAuto` command is registered.
- **Jobset UX enhancements**: Output directory picker with project-aware
  defaults, sibling `.kicad_pro` auto-detection via `findSiblingProjectFile`,
  success/failure notifications with "Open Output Folder" action, and
  `kicadstudio.jobset.stopOnError` setting.
- **Variant-aware export plumbing**: Active variant is read from `.kicad_pro`
  and threaded through `ExportCommandBuildOptions` → `buildCliExportCommands`
  → `build3dVariantArgs()`; `--variant` is only emitted when the CLI version
  is ≥ 10.
- **Consolidated QuickPick commands**: `kicadstudio.exportTo` (35 export
  formats grouped by category: Schematic 2D, PCB 2D, Manufacturing, 3D
  Models, Documentation, BOM/Netlist, Other) and `kicadstudio.importFrom` (10
  import formats with Auto-detect).
- **Debounced project scan watcher**: File system watcher for `.kicad_pro`
  files with 500 ms debounce that refreshes contexts, project tree, and
  variant tree when KiCad projects are created or deleted.
- Surfaced KiCad 8.x, 9.x, and 10.0.x compatibility state in the status
  bar/menu with feature-level capability probe results.
- Added explicit KiCanvas/CLI SVG fallback/metadata-only viewer engine state,
  toolbar engine badges, unsupported-control disabling, and regression coverage
  for fallback diagnostics.

### Changed

- **Workspace Trust enforcement audit**: Verified all 40+ export, import,
  and jobset commands are gated by `registerTrustedCommand()`; CLI detection,
  MCP connection, and context bridge already check `isWorkspaceTrusted()`.
- **Path security audit**: Confirmed `resolveWorkspaceOutputDir()` uses
  `realpathSync.native` + `assertPathInside()` to block path traversal and
  symlink escape; CLI binary normalization also resolves symlinks.
- **Remote MCP endpoint security**: `validateEndpoint()` in `mcpClient.ts`
  rejects non-loopback hosts unless `kicadstudio.mcp.allowRemoteEndpoint` is
  explicitly enabled (default: off).
- **Context bridge privacy audit**: `ContextBridge` validated — only file
  paths, project metadata, DRC messages, viewer state, and variant names are
  transmitted; no PII sent; debounce per trigger reason.
- Clarified Codex support as an external MCP client workflow, removed it from the
  direct extension provider settings, and migrated legacy
  `kicadstudio.ai.provider=codex` selections to GitHub Copilot.
- Restyled the KiCanvas viewer toolbar with VS Code theme tokens, compact
  spacing, and a single primary reload action for dark, light, and high-contrast
  themes.

### Deprecated

- Marked KiCad 9.x as a deprecated best-effort compatibility line in status
  surfaces now that upstream active maintenance has ended.

## [1.0.0] - 2026-05-20

### Added

- Released the baseline KiCad Studio extension from the canonical monorepo.
