# Changelog

## [0.1.1](https://github.com/reelout/reelout/compare/%40reelout%2Fyarn%400.1.0...%40reelout%2Fyarn%400.1.1) (2026-11-26)

### Bug Fixes

- **npm:** harden registry authentication and OIDC trusted publishing ([#35](https://github.com/reelout/reelout/issues/35)) ([f866315](https://github.com/reelout/reelout/commit/f866315c6561c41517c63be1075f56c5d7d22aa3))

## 0.1.0 (2026-11-24)

### Features

- **cargo:** add Cargo workspace release plugin ([#30](https://github.com/reelout/reelout/issues/30)) ([8aa7abc](https://github.com/reelout/reelout/commit/8aa7abcf201477d2cf029d6c7567baf5b071e556))
- **cli:** add command-line interface ([57f1b39](https://github.com/reelout/reelout/commit/57f1b39957645f7ba7c73f05c113690510acd134))
- **config:** load and resolve user configuration ([fe85818](https://github.com/reelout/reelout/commit/fe85818a71774ed9b263ed641387b890a161cef2))
- **core:** match files with glob patterns ([50b4f9d](https://github.com/reelout/reelout/commit/50b4f9d9fcbf48cc41d19f2b38c4a85b31721168))
- **core:** parse conventional commits ([d1f85cb](https://github.com/reelout/reelout/commit/d1f85cb9ed783d262050e2236cb79698f9c259fd))
- **core:** read and write changelog files ([3241e38](https://github.com/reelout/reelout/commit/3241e38e0e1b52f5b7c0b7f949e81baf354c7a73))
- **core:** read and write JSON files ([5697e8e](https://github.com/reelout/reelout/commit/5697e8ed29d818a9270a8410c2645cee8c74acf2))
- make releases credential-aware ([#20](https://github.com/reelout/reelout/issues/20)) ([e4504a7](https://github.com/reelout/reelout/commit/e4504a709adea9f208589f4b2ad6027ae40bdf69))
- **npm:** publish packages ([ad319ff](https://github.com/reelout/reelout/commit/ad319ff7aee4943789b57fa41186f102cde275aa))
- **npm:** read and write package manifest files ([8240254](https://github.com/reelout/reelout/commit/8240254774489065db74da9fd7100e382db0b467))
- **npm:** resolve workspace packages ([bbc1a04](https://github.com/reelout/reelout/commit/bbc1a046d44d0172ca79e45ee835cd9b22858bb8))
- **yarn:** split Yarn support into the @reelout/yarn plugin ([#34](https://github.com/reelout/reelout/issues/34)) ([bd2b5ce](https://github.com/reelout/reelout/commit/bd2b5ce51ac7ce933c98428eef53732e33cde97c))

### Bug Fixes

- **deps:** pin @yarnpkg/core to 4.9.1 and update dependencies ([#11](https://github.com/reelout/reelout/issues/11)) ([fe2845e](https://github.com/reelout/reelout/commit/fe2845e4b6409b37f2195b6fa94f19ff11c31570)), references [yarnpkg/berry#7282](https://github.com/reelout/reelout/issues/7282) [pnpm/pnpm#16590](https://github.com/reelout/reelout/issues/16590)
