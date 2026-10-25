# Changelog

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
