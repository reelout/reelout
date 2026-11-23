# Changelog

## [0.13.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.12.0...%40reelout%2Fnpm%400.13.0) (2026-11-23)

### Features

- enable all built-in plugins by default ([#33](https://github.com/reelout/reelout/issues/33)) ([f3f8895](https://github.com/reelout/reelout/commit/f3f889597ef14c96cda8cba8478e1790130e8345))

## [0.12.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.11.0...%40reelout%2Fnpm%400.12.0) (2026-11-23)

### Features

- **npm:** fall back to staged publishing when the registry requires staging ([#32](https://github.com/reelout/reelout/issues/32)) ([33b44ab](https://github.com/reelout/reelout/commit/33b44ab02bc54b0e39cb536ade05e4608873256b))

## [0.11.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.10.0...%40reelout%2Fnpm%400.11.0) (2026-11-22)

### Features

- **cargo:** add Cargo workspace release plugin ([#30](https://github.com/reelout/reelout/issues/30)) ([8aa7abc](https://github.com/reelout/reelout/commit/8aa7abcf201477d2cf029d6c7567baf5b071e556))

## [0.10.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.9.0...%40reelout%2Fnpm%400.10.0) (2026-11-22)

### Features

- **npm:** verify OIDC trusted publishing before publishing ([#31](https://github.com/reelout/reelout/issues/31)) ([d15fee8](https://github.com/reelout/reelout/commit/d15fee893f4b03c639c8dd842f32d08c69e5f81e))

## [0.9.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.8.0...%40reelout%2Fnpm%400.9.0) (2026-11-22)

### Features

- **npm:** verify publish permission before publishing ([#29](https://github.com/reelout/reelout/issues/29)) ([1b7af00](https://github.com/reelout/reelout/commit/1b7af0069c2a4cdefb9ae30c8b2f4b30271e71d1))

## [0.8.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.7.0...%40reelout%2Fnpm%400.8.0) (2026-11-21)

### Features

- make releases credential-aware ([#20](https://github.com/reelout/reelout/issues/20)) ([e4504a7](https://github.com/reelout/reelout/commit/e4504a709adea9f208589f4b2ad6027ae40bdf69))

### Bug Fixes

- verify hosting tokens against the release repository ([#27](https://github.com/reelout/reelout/issues/27)) ([a4bf04f](https://github.com/reelout/reelout/commit/a4bf04f6eef9ebbdf9c406991f3471d19eda7660)), references [#20](https://github.com/reelout/reelout/issues/20)

## [0.7.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.6.4...%40reelout%2Fnpm%400.7.0) (2026-11-20)

### Features

- **core:** mark dry runs in release reports ([#24](https://github.com/reelout/reelout/issues/24)) ([1bb4d31](https://github.com/reelout/reelout/commit/1bb4d318a6c4382e9f06ea1075f06fc51864548e))

## [0.6.4](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.6.3...%40reelout%2Fnpm%400.6.4) (2026-11-20)

### Bug Fixes

- **core:** report finalize failures as warnings on successful releases ([#21](https://github.com/reelout/reelout/issues/21)) ([b1c7595](https://github.com/reelout/reelout/commit/b1c759590a44d57c9eead7c530533cf4345ecd2b))

## [0.6.3](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.6.2...%40reelout%2Fnpm%400.6.3) (2026-11-20)

### Features

- **core:** run finalize hook on all terminal outcomes ([#19](https://github.com/reelout/reelout/issues/19)) ([97ae51e](https://github.com/reelout/reelout/commit/97ae51e0df83abcc2978f6bf687dad2d044e08f6))

## [0.6.2](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.6.1...%40reelout%2Fnpm%400.6.2) (2026-11-19)

### Features

- **core:** report releases to the GitHub Actions job summary ([#18](https://github.com/reelout/reelout/issues/18)) ([cbb6c48](https://github.com/reelout/reelout/commit/cbb6c4880f88930ae99e71c3ddb156e5789d25c9))

## [0.6.1](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.6.0...%40reelout%2Fnpm%400.6.1) (2026-11-19)

### Features

- **core:** slice package history by verified git tags ([#17](https://github.com/reelout/reelout/issues/17)) ([5fd8557](https://github.com/reelout/reelout/commit/5fd85573d41b3b1c2647f1711418cec31021c610))

## [0.6.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.5.4...%40reelout%2Fnpm%400.6.0) (2026-11-17)

### Features

- **core:** add --filter flag to release matching packages ([#15](https://github.com/reelout/reelout/issues/15)) ([2077128](https://github.com/reelout/reelout/commit/20771281ad5e76d146e9d297ceb0f1374377d22e))

## [0.5.4](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.5.3...%40reelout%2Fnpm%400.5.4) (2026-11-17)

### Bug Fixes

- **core:** bump minor instead of major for breaking changes on 0.x ([#16](https://github.com/reelout/reelout/issues/16)) ([217b7e0](https://github.com/reelout/reelout/commit/217b7e035cc0630b920c9b15208eab5a31f668c9))

## [0.5.3](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.5.2...%40reelout%2Fnpm%400.5.3) (2026-11-16)

### Bug Fixes

- **core:** update every package with --type patch ([#14](https://github.com/reelout/reelout/issues/14)) ([ea51cef](https://github.com/reelout/reelout/commit/ea51cef2ee78112b6b224024df628bc4337569da))

## [0.5.2](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.5.1...%40reelout%2Fnpm%400.5.2) (2026-11-16)

### Bug Fixes

- **npm:** gate default provenance on the manifest repository ([#13](https://github.com/reelout/reelout/issues/13)) ([c6c342b](https://github.com/reelout/reelout/commit/c6c342bf5d97739710700195cc414313f1467bd5))

## [0.5.1](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.5.0...%40reelout%2Fnpm%400.5.1) (2026-11-15)

### Bug Fixes

- **npm:** release members when the pnpm workspace manifest changes ([#12](https://github.com/reelout/reelout/issues/12)) ([e885f31](https://github.com/reelout/reelout/commit/e885f319265d4662a7e704a592cc6a17eb289219))

## [0.5.0](https://github.com/reelout/reelout/compare/%40reelout%2Fnpm%400.4.0...%40reelout%2Fnpm%400.5.0) (2026-10-31)

### Features

- **npm:** gate verbose publish output in quiet environments ([#2](https://github.com/reelout/reelout/issues/2)) ([123be30](https://github.com/reelout/reelout/commit/123be30bc4b6721dc525924466d8ba826f63d15c))

## 0.4.0 (2026-10-26)

### Features

- **cli:** add command-line interface ([57f1b39](https://github.com/reelout/reelout/commit/57f1b39957645f7ba7c73f05c113690510acd134))
- **config:** load and resolve user configuration ([fe85818](https://github.com/reelout/reelout/commit/fe85818a71774ed9b263ed641387b890a161cef2))
- **context:** prepare execution context ([c96abd2](https://github.com/reelout/reelout/commit/c96abd2d09766c553b93ab72b70c60a9ed9747c7))
- **core:** add array filtering utilities ([4583d8f](https://github.com/reelout/reelout/commit/4583d8f28d3647ee5ec74f00d60a0d13e4687102))
- **core:** analyze repository changes ([15f53a6](https://github.com/reelout/reelout/commit/15f53a6817b8c6d04b45ab1da7247f98fe81e716))
- **core:** build distribution artifacts ([b0cde4d](https://github.com/reelout/reelout/commit/b0cde4d65e14bc7f0b78c675ee3ef354e5268ebc))
- **core:** create and manage Git tags ([4fe24a0](https://github.com/reelout/reelout/commit/4fe24a0bfbe95e492631471067dfc630b76a135a))
- **core:** detect CI environment ([f01bb53](https://github.com/reelout/reelout/commit/f01bb53bd60b63e3e008efbe21454a51939b6bdf))
- **core:** extract and normalize error messages ([6863c9a](https://github.com/reelout/reelout/commit/6863c9a9a89d5f223524773b797ac49e1f17c25d))
- **core:** format source files ([7a2a89f](https://github.com/reelout/reelout/commit/7a2a89fa154f53304021648d3a675097d7c0ba85))
- **core:** generate release changelogs ([d7712f5](https://github.com/reelout/reelout/commit/d7712f51d172b707774e18d368c63b4b1fc8e498))
- **core:** identify unreleased changes ([a00fb99](https://github.com/reelout/reelout/commit/a00fb99a9e2cd12a31bb1e7a9d188ccf5752e183))
- **core:** introduce plugin architecture ([affc557](https://github.com/reelout/reelout/commit/affc55701a737464b5602093fe5048dd051d4b3a))
- **core:** match files with glob patterns ([50b4f9d](https://github.com/reelout/reelout/commit/50b4f9d9fcbf48cc41d19f2b38c4a85b31721168))
- **core:** parse conventional commits ([d1f85cb](https://github.com/reelout/reelout/commit/d1f85cb9ed783d262050e2236cb79698f9c259fd))
- **core:** read and write changelog files ([3241e38](https://github.com/reelout/reelout/commit/3241e38e0e1b52f5b7c0b7f949e81baf354c7a73))
- **core:** read and write JSON files ([5697e8e](https://github.com/reelout/reelout/commit/5697e8ed29d818a9270a8410c2645cee8c74acf2))
- **core:** run shell commands ([4a379da](https://github.com/reelout/reelout/commit/4a379da17365ceaf5a791445cdb69f1472fd591d))
- **core:** support template string interpolation ([fe8c531](https://github.com/reelout/reelout/commit/fe8c5317ecb516640afb8c02f033e670da93e506))
- **core:** traverse Git history ([d44779f](https://github.com/reelout/reelout/commit/d44779f4ed14d6839d44e5d8b485f78a692411af))
- **git:** commit version-bump changes ([7598828](https://github.com/reelout/reelout/commit/75988280fc98a2eebffeda5cd1378eebef2494fc))
- **github:** automate GitHub releases ([05df423](https://github.com/reelout/reelout/commit/05df423c5377700f5dd972ee01d85967fce022e4))
- **gitlab:** automate GitLab releases ([9fa5568](https://github.com/reelout/reelout/commit/9fa5568cdf8dd7e7530678d4905f7d616c166b94))
- **npm:** publish packages ([ad319ff](https://github.com/reelout/reelout/commit/ad319ff7aee4943789b57fa41186f102cde275aa))
- **npm:** read and write package manifest files ([8240254](https://github.com/reelout/reelout/commit/8240254774489065db74da9fd7100e382db0b467))
- **npm:** resolve workspace packages ([bbc1a04](https://github.com/reelout/reelout/commit/bbc1a046d44d0172ca79e45ee835cd9b22858bb8))
