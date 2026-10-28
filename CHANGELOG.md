# Changelog

## [2.2.1](https://github.com/brazaoo4/ticketera/compare/v2.2.0...v2.2.1) (2026-10-28)


### Performance Improvements

* **ci:** use native arm64 runners and build matrix to eliminate QEMU build bottleneck ([22fdbaa](https://github.com/brazaoo4/ticketera/commit/22fdbaa7e22821ebfe357d4399400cccaf80db75))
* **ci:** use native arm64 runners and build matrix to eliminate QEMU build bottleneck ([a01779f](https://github.com/brazaoo4/ticketera/commit/a01779f8caacaafbf08b6ec8c104a95002e6e2ce))

## [2.2.0](https://github.com/brazaoo4/ticketera/compare/v2.1.0...v2.2.0) (2026-10-28)


### Features

* **oss:** prepare repository for public open-source release on GitHub ([a293ffa](https://github.com/brazaoo4/ticketera/commit/a293ffa6d66041686192773681774b1838613fcf))
* **oss:** prepare repository for public open-source release on GitHub ([c8f5f41](https://github.com/brazaoo4/ticketera/commit/c8f5f419a2251c134a169971bdc06abaec446ac0))

## [2.1.0](https://github.com/brazaoo4/ticketera/compare/v2.0.1...v2.1.0) (2026-10-25)

### Features

* **core:** migrate framework to Next.js 16.4.3 and Prisma 7.10.1 using `@prisma/adapter-pg` pool and `prisma.config.ts`
* **security & routing:** transition from deprecated `middleware.ts` to Next.js 16 `src/proxy.ts`
* **i18n & ui:** complete English localization across application UI, modals, error banners, and receipt reject messages
* **admin:** consolidate user profile dropdown settings navigation to a single clean `Settings` portal
* **admin:** reorder admin header navigation tabs to prioritize `System Settings`
* **admin:** harmonize Product Catalogue page with top banner, breadcrumbs, and 4 KPI stats cards matching other admin tabs
* **ci:** configure Google Release Please automated semantic versioning and changelog generation
* **ci:** add `workflow_call` trigger to container build workflow for automated GHCR multi-arch publishing

### Bug Fixes

* **types:** isolate analytical client-safe types to prevent PostgreSQL server dependencies from leaking into browser bundles
* **stores:** complete English translation for custom supermarket creation modal and live preview badges
* **upload:** translate receipt processing error banners and discard buttons to English

## [2.0.1](https://github.com/brazaoo4/ticketera/compare/v2.0.0...v2.0.1) (2026-10-25)

### Features

* **admin:** dynamic Public/Private catalogue access policy toggle under `/admin/settings`
* **stores:** custom Spanish supermarket management with brand hex colors
* **demo:** 1-click demo dataset loader and purge transaction
