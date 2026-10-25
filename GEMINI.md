# 🧠 Ticketera — AI Context & Architecture Handover (`GEMINI.md`)

> **📌 CURRENT STATUS & NEXT STEP (Updated: October 2026)**
> - **Repository State:** Milestones 1–7, **v2.0 "Occasional Batch & Deep Analytics"**, **Shrinkflation & Spanish IVA Intelligence**, and **Smart Format Normalization, Catalog Lookup & Multi-Size Product Engine** are **100% complete, hardened, and live** with zero static/mock data.
> - **Recent Enhancements:**
>   - **In-App System Settings & Dynamic Public/Private Catalogue Policy (`/admin/settings`):** Administrators can toggle the public/private catalogue policy directly inside the application UI under `/admin/settings` (or via top/mobile navigation). Persisted in PostgreSQL (`SystemSetting` table) and synchronized live to `process.env.PUBLIC_CATALOG` with instant cache revalidation—no container or server restart required.
>   - **Open-Source Readiness & Privacy Policy (`PUBLIC_CATALOG`):** Private-by-default architecture where unauthenticated visitors are redirected to `/login` unless `PUBLIC_CATALOG=true`. External OpenFoodFacts User-Agent dynamically parameterized. First-login root admin creation hardened and secondary claim path eliminated.
>   - **Custom Supermarkets Management (`/stores` & `stores-client.tsx`):** Users can add and manage regional Spanish supermarket chains (Eroski, BM, Ahorramas, Bonpreu, Gadis, HiperDino) with custom brand hex colors and live badge previews. AI OCR worker dynamically matches custom chains alongside core supermarkets.
>   - **1-Click Demo Mode (`src/lib/demo/demo-data.ts` & `npm run demo:load`):** Deterministic mock dataset spanning 6 months across 5 supermarkets with realistic Spanish tax brackets and intentional shrinkflation radar trigger (Galletas Tostadas 500g -> 420g). One-click demo exit cleanly purges all demo receipts and placeholder WebP files in a single database transaction.
>   - **Standard Self-Hosting Stack (`docker-compose.yml` & GHCR CI):** Self-contained root `docker-compose.yml` with healthchecked PostgreSQL 16 (`pg_trgm`) and Redis 7. Multi-arch GitHub Actions CI for lint/typecheck/build and Renovate-friendly GHCR image publisher under `AGPL-3.0-only`.
>   - **Automated Version Bumping & Release Please (`.github/workflows/release-please.yml`):** Implemented Google Release Please for automated Semantic Versioning via Conventional Commits. Maintains automated release PRs updating `package.json`, `package-lock.json`, and `CHANGELOG.md`, and triggers multi-arch GHCR publishing on merge.
>   - **PWA Service Worker & Full Android/iOS Installability (`public/sw.js`, `service-worker-registration.tsx`, `manifest.ts`):** Complete Progressive Web App installation support aligned with Sudoku Duel architecture. Implemented cache-first asset caching, network-first navigation with offline fallback, non-GET pass-through for Web Share Target (`POST /upload-share`), 192px/512px maskable icon sets, and an interactive `InstallAppButton` component capturing `beforeinstallprompt`.
>   - **Product Catalogue Multi-Dimensional Sorting & English Unit Standardization (`/products` & `products-client.tsx`):** Users can sort the entire product catalogue by **Name** (alphabetical A–Z), **Recently Bought** (latest confirmed purchase date first with live contextual date badges), and **Most Bought** (total confirmed purchase frequency first with dynamic purchase counts). Standardized all unit labels from Spanish `€/ud` to English `€/unit` across `/products`, `/products/[slug]`, and `/stores/[slug]`.
>   - **Direct Receipt Sighting Edit & Correction Engine (`/products/[slug]` & `updateSightingAction`):** Users and administrators can directly correct receipt sighting observations from the Historical Receipt Sightings table on `/products/[slug]`. Interactive modal allows editing pack shelf price, quantity, net package weight/content (with 1-tap quick presets for KG, L, and UNIT), purchase date, and raw receipt text with live mathematical preview (total spend, normalized unit price, and pack format badge) and instantaneous local state + cache revalidation.
>   - **Smart Format Normalization & SKU Pack-Size Memory (`prisma/schema.prisma` & `receipt-worker.ts`):** `ProductAlias` stores deterministic net content per pack (`unitMeasurePerPack` e.g. `1.500` for 1.5L, `0.500` for 4x125g) and checkout variable weight flag (`isVariableWeight`). Strict BaseUnit locking enforces canonical `Product.baseUnit` across all linked receipt items. Subsequent receipts from the same store auto-apply pack sizes instantaneously.
>   - **1-Click Spanish Supermarket Catalog Lookup (`GET /api/catalog/lookup` & `src/lib/catalog/parser.ts`):** Seamless OpenFoodFacts Spain integration with private-label brand mapping (Hacendado, Milbona, etc.) and `parseSpanishCatalogQuantity()` parser. 1-tap format presets and catalog modal inside `/receipts/[id]/review`.
>   - **Multi-Format Product Polish & Retroactive History Normalizer (`/products/[slug]` & `normalizeProductHistoryAction`):** Format badges (`Envase 1.5L`, `Envase 2L`, `Envase 5L`) in Recharts tooltips and historical sightings table, format filter pills (`Todos los formatos`, `Envase 1L`, `Envase 5L`) with Pack Price mode protection, and admin modal to recalculate historical purchases atomically across database records.
>   - **Shrinkflation False-Positive Guardrail (`src/lib/analytics/shrinkflation.ts`):** Multi-size catalog purchase protection checking pack size reduction ratio (`0.75 <= ratio <= 0.95` or exact POS SKU match) and excluding variable checkout weight items (loose produce, butcher counter).
>   - **Shrinkflation Radar ("Radar de Reduflación" & `src/lib/analytics/shrinkflation.ts`):** Pure PostgreSQL query engine detecting stealth quantity reductions ($\ge 5\%$) where the shelf pack price remained roughly identical ($\pm 10\%$) while the price per kg/L spiked ($\ge 5\%$). Visualized on `/my-stats` and with high-visibility warning banners and `<ReferenceLine>` timeline markers on `/products/[slug]`.
>   - **Spanish Grocery Tax & IVA Policy Tracker ("El Impacto del IVA"):** AI-extracted printed tax breakdown tables (`taxBreakdown` JSON: `% IVA`, base imponible, cuota) visualized on `/my-stats` (KPIs for Total IVA, effective tax rate, net food spend, and Superreducido 0%-4% / Reducido 5%-10% / General 21% breakdown) and `/receipts/[id]/review` math sanity verification.
>   - **Multi-File Batch Upload & Long Receipt Stitching (`/upload` & `preprocess.ts`):** Drop up to 15 receipts at once with live parallel BullMQ extraction, or vertically stitch 2–3 photo long paper receipts into a single 1600px canvas via `sharp` with auto-rotation, contrast normalization, and single-ticket AI extraction.
>   - **Rapid "Confirm & Next Pending" Review Workflow (`/receipts/[id]/review`):** Seamless one-click review queue with sticky `[ ✅ Confirmar y Siguiente (Quedan N) → ]` button, immediate `ProductAlias` training, and automatic re-matching check upon loading subsequent receipts in the batch.
>   - **"Tu IPC Real" Personal Inflation Engine (`/my-stats`):** Global timeframe selector (`3M`, `6M`, `1Y`, `2Y`, `All`), 3-Card Hero Strip computing user's consumption-weighted personal inflation rate vs. general staple benchmark with monthly euro impact (`+€X/mes`), supermarket efficiency ranking, category price acceleration breakdown, and Top 5 Habitual Staples & Shrinkflation Watch.
>   - **One-Click Data Portability (`GET /api/export` & `ExportDataMenu`):** Excel-safe UTF-8 BOM (`\uFEFF`) CSV exports (`items_csv`, `receipts_csv`) and structured JSON backup (`json`) downloadable in one click across `/my-stats` and `/my-receipts`.
> - **Production Readiness:** Full system operational via Docker Compose (Next.js 16 with Turbopack, Prisma 7 with pg adapter, PostgreSQL 16 with `pg_trgm`, Redis 7, BullMQ worker, and AI failover).

---

## Section A: Project Identity & Core Vision

- **Name:** Ticketera (`brazaoo4/ticketera`)
- **Purpose:** Self-hosted Spanish grocery receipt scanner and multi-year price history / inflation intelligence platform across **Mercadona**, **Lidl**, **Carrefour**, **Alcampo**, **Consum**, **DIA**, **Aldi**, **MAS**, and **Cash Fresh**.
- **Core Value Loop:**
  1. **Upload (`/upload`):** User drops single receipts, batches of up to 15 tickets, or multi-photo long tickets (auto-stitched into 1 ticket).
  2. **Preprocess & AI Failover:** Backend computes SHA-256 `fileHash` for deduplication, enhances contrast via `sharp` (or extracts text via `pdf-parse`), and runs the structured-output failover chain (**Gemini 2.5 Flash $\rightarrow$ Groq Multimodal $\rightarrow$ OpenAI GPT-4o-mini**), extracting supermarket, date, total, and normalized items (`KG`, `L`, `UNIT`). After parsing, `compressReceiptImage()` re-encodes WebP to compact storage.
  3. **Smart Alias & Fuzzy Matching (`receipt-worker.ts`):** BullMQ worker matches `raw_name` against `ProductAlias` (`100%` deterministic match) or fuzzy-matches `suggested_name` against `Product` via `pg_trgm`.
  4. **Rapid Review & Self-Learning (`/receipts/[id]/review`):** 15-second review with math sanity bar and `[ Confirmar y Siguiente → ]`. Confirming trains `ProductAlias` so subsequent tickets in the batch auto-match instantaneously.
  5. **Public & Personal Price Intelligence:** Confirmed sightings power public Recharts multi-year charts across `/products`, `/compare`, `/stores`, plus private "Tu IPC Real" personal consumption-weighted inflation analytics on `/my-stats` and one-click data portability exports (`/api/export`).

---

## Section B: Strict UI/UX & Codebase Rules (Non-Negotiable Guardrails)

Every prompt and code modification in this repository **must** obey these four permanent guardrails:

1. **Zero Infrastructure/Dev Clutter in UI:**
   - Never display server hostnames, OS versions, database/queue internals (`PostgreSQL`, `Redis`, `BullMQ`, `pg_trgm`), raw `#HEX` codes, database slugs (`slug: ...`), or development banners anywhere in the frontend UI.
2. **100% Database-Driven (Zero Hardcoded UI Product Arrays or Synthetic Seeds):**
   - Never put static/mock product arrays, hardcoded search suggestions, or synthetic demo receipt generators in UI components or startup hooks.
   - All products, search suggestions (`/api/products/search`), prices, store counts, and charts must query PostgreSQL via Prisma (`Product`, `ReceiptItem`, `Receipt`, `Store`). Only the 9 core supermarket definitions (`CORE_STORES`) and the initial admin account are seeded on boot.
3. **Strict Single-Line Buttons & Navbar (`whitespace-nowrap shrink-0`):**
   - Every button, badge, pill, and navigation link across the app must include `whitespace-nowrap shrink-0` so text never wraps onto 2 lines.
   - Keep top navigation labels concise (`Home`, `Products`, `Compare`, `Stores`, plus the user account dropdown).
4. **Graphs & Multi-Year History First:**
   - Every product card must link to `/products/[slug]`, which renders an interactive multi-store Recharts price evolution graph (`1M`, `3M`, `6M`, `1Y`, `2Y`, `All`), unit normalization toggle (`€/kg · €/L` vs `Pack €`), and store-by-store ranking. The homepage prioritizes high-density, mobile-first staple cards and market trends rather than heavy single-product Cartesian grids.

---

## Section C: Complete File & Directory Map

```text
ticketera/
├── docker-compose.yml                            # Production Docker Compose stack (Next.js 16, PostgreSQL 16, Redis 7)
├── prisma.config.ts                              # Prisma 7 configuration file declaring datasource URL, schema location, and tsx seed runner
├── .env.example                                  # Template environment variables for local and production setup
├── prisma/
│   ├── schema.prisma                                 # Complete PostgreSQL schema (User, Store, Receipt, Product, ProductAlias, ReceiptItem)
│   └── seed.ts                                       # CLI Prisma seed script that upserts the 9 core Spanish supermarkets
└── src/
    ├── instrumentation.ts                            # Next.js Node runtime startup hook: runs DB schema/store check & boots BullMQ worker
    ├── proxy.ts                                      # Next.js 16 Auth.js v5 network proxy boundary protecting write/admin routes
    ├── types/
    │   └── next-auth.d.ts                            # TypeScript module augmentation adding id, username, and role (ADMIN | USER) to Session/JWT
    ├── lib/
    │   ├── auth.config.ts                            # Edge-compatible Auth.js configuration, public/protected route rules, and JWT callbacks
    │   ├── auth.ts                                   # Full Node Auth.js setup with Credentials provider, bcrypt validation, and env admin bootstrap
    │   ├── db.ts                                     # Singleton PrismaClient instance for PostgreSQL connection pooling
    │   ├── redis.ts                                  # Singleton ioredis client configured for BullMQ (`maxRetriesPerRequest: null`)
    │   ├── startup.ts                                # Idempotent boot initializer: DDL check, CORE_STORES upsert, category migration & orphan cleanup
    │   ├── utils.ts                                  # Tailwind `cn()` class merger (`clsx` + `tailwind-merge`)
    │   ├── settings.ts                               # Dynamic PostgreSQL SystemSetting manager for in-app configuration (PUBLIC_CATALOG)
    │   ├── analytics/
    │   │   ├── shrinkflation.ts                      # Pure PostgreSQL Shrinkflation engine detecting stealth quantity reductions
    │   │   └── shrinkflation-types.ts                # Client-safe shrinkflation types and measure formatting helpers
    │   ├── catalog/
    │   │   └── parser.ts                             # OpenFoodFacts Spain product quantity parser & store-to-brand mapping
    │   ├── receipts/
    │   │   ├── pdf-extract.ts                        # Extracts raw text from digital supermarket PDFs using `pdf-parse`
    │   │   └── preprocess.ts                         # SHA-256 hashing, `sharp` thermal contrast WebP pipeline, and post-OCR image compression
    │   ├── ai/
    │   │   ├── schema.ts                             # Zod schemas (`ParsedReceiptSchema`, `ParsedReceiptItemSchema`) and canonical category list
    │   │   ├── prompt.ts                             # System & user prompts instructing LLMs on Spanish receipt extraction & unit normalization
    │   │   ├── parse-receipt.ts                      # Failover orchestrator executing Gemini -> Groq -> OpenAI with latency telemetry
    │   │   └── providers/
    │   │       ├── gemini.ts                         # Primary AI provider: Google Gemini 2.5 Flash multimodal vision & JSON structured output
    │   │       ├── groq.ts                           # Secondary AI provider: Groq multimodal vision + JSON schema parser
    │   │       └── openai.ts                         # Tertiary AI provider: OpenAI GPT-4o-mini vision & text structured output fallback
    │   └── queue/
    │       ├── receipt-queue.ts                      # BullMQ queue (`tt:receipt-parse`) with automatic in-process fallback if Redis is offline
    │       └── receipt-worker.ts                     # BullMQ worker: runs AI parse, resolves store/date, matches aliases/pg_trgm, saves items & compresses image
    ├── components/
    │   ├── common/
    │   │   └── export-data-menu.tsx                  # One-click data portability dropdown (CSV items, CSV receipts, JSON backup)
    │   ├── home/
    │   │   └── home-price-intelligence.tsx           # Mobile-first intelligence dashboard: Market Pulse metrics, Essential Staples Watchlist cards, Supermarket Barometer, Market Movers & recent receipts feed
    │   ├── layout/
    │   │   ├── app-shell.tsx                         # Global responsive shell wrapping DesktopNav, MobileNav, SearchModal, and footer
    │   │   ├── desktop-nav.tsx                       # Top navigation bar with ⌘K search trigger, Upload CTA, and user/admin dropdown menu
    │   │   ├── mobile-nav.tsx                        # Sticky 5-slot mobile bottom bar (`Home`, `Products`, `+ Receipt`, `Compare`, `My Data`)
    │   │   └── search-modal.tsx                      # Global `⌘K` search dialog with live debounced `pg_trgm` product lookup
    │   └── providers/
    │       └── auth-provider.tsx                     # Client-side NextAuth `SessionProvider` wrapper
    └── app/
        ├── globals.css                               # Tailwind CSS v4 styles, dark theme variables, and `tabular-nums` utilities
        ├── layout.tsx                                # Root HTML layout loading Inter & JetBrains Mono fonts, AuthProvider, and AppShell
        ├── manifest.ts                               # PWA Web App Manifest configuring standalone mode, icons, and W3C Web Share Target
        ├── page.tsx                                  # Public `/` server page querying confirmed products & recent receipts for the intelligence dashboard
        ├── login/
        │   └── page.tsx                              # Credentials sign-in page with callback redirect and error feedback
        ├── upload/
        │   ├── page.tsx                              # Protected `/upload` server page fetching stores for the upload dropzone
        │   └── upload-client.tsx                     # Camera/PDF dropzone (up to 15 receipts, batch mode, long ticket stitch mode) with live queue
        ├── upload-share/
        │   └── route.ts                              # Native Android Web Share Target POST handler for mobile app ticket sharing
        ├── receipts/[id]/review/
        │   ├── page.tsx                              # Protected `/receipts/[id]/review` page loading receipt, auto-rematching ProductAlias & queue
        │   ├── actions.ts                            # Server Actions: `confirmReceiptAction` (trains `ProductAlias`), `reopenReceiptAction`, `deleteReceiptAction`
        │   ├── review-workstation.tsx                # Split-screen review UI with Confirm & Next Pending CTA, unit math & sticky sanity bar
        │   ├── receipt-viewer.tsx                    # Zoomable/pannable original receipt image & PDF evidence viewer
        │   └── product-search-modal.tsx              # Modal for linking a receipt line item to an existing canonical `Product`
        ├── products/
        │   ├── page.tsx                              # Public `/products` server page fetching all confirmed products and sightings
        │   └── products-client.tsx                   # Searchable catalogue with category pills, `€/kg` vs `Pack €` toggle, and SVG sparklines
        ├── products/[slug]/
        │   ├── page.tsx                              # Public `/products/[slug]` server page fetching product history and store aliases
        │   ├── actions.ts                            # Server Actions: delete erroneous product sighting and update canonical product details
        │   └── product-tracker-client.tsx            # Deep-dive Recharts price evolution graph (`1M`–`All`), store ranking table & POS alias list
        ├── compare/
        │   ├── page.tsx                              # Public `/compare` server page loading confirmed products and supermarket chains
        │   └── compare-client.tsx                    # Multi-store basket comparator computing single-store totals vs. Smart Split Basket savings
        ├── stores/
        │   └── page.tsx                              # Public `/stores` directory showing real tracked product and receipt counts per chain
        ├── stores/[slug]/
        │   └── page.tsx                              # Public `/stores/[slug]` supermarket intelligence page with tracked items & recent receipts
        ├── my-receipts/
        │   └── page.tsx                              # Protected `/my-receipts` history page with status badges and One-Click Export
        ├── my-stats/
        │   ├── page.tsx                              # Protected `/my-stats` with store-wide staple benchmark and personal item sightings
        │   └── my-stats-client.tsx                   # "Tu IPC Real" Personal Inflation, 3-Card Hero Strip, Category Inflation & Shrinkflation Watch
        ├── admin/products/
        │   ├── page.tsx                              # Admin-only `/admin/products` catalogue page with product & staple statistics
        │   ├── actions.ts                            # Admin Server Actions: toggle staple, update product, merge products atomically, auto-heal
        │   └── product-management-client.tsx        # Interactive admin table with search, filters, staple toggle, Edit modal, Merge modal & Auto-Heal
        ├── admin/users/
        │   ├── page.tsx                              # Admin-only `/admin/users` server page listing accounts and receipt counts
        │   ├── actions.ts                            # Admin Server Actions: create user, toggle enabled status, and reset password
        │   └── user-management-client.tsx            # Interactive admin user management table and modals
        ├── admin/settings/
        │   ├── page.tsx                              # Admin-only `/admin/settings` page for global privacy & instance preferences
        │   ├── actions.ts                            # Admin Server Actions: `updatePublicCatalogAction`
        │   └── settings-client.tsx                   # Interactive settings UI with Public/Private toggle, demo data controls & AI overview
        ├── admin/page.tsx                            # Admin redirect router sending admins to `/admin/settings`
        └── api/
            ├── auth/[...nextauth]/route.ts           # Auth.js v5 HTTP GET/POST handlers
            ├── catalog/lookup/route.ts               # Authenticated GET catalog lookup (OpenFoodFacts Spain API)
            ├── export/route.ts                       # Protected GET export endpoint (Excel UTF-8 BOM CSV items/receipts & structured JSON)
            ├── health/route.ts                       # Container healthcheck endpoint verifying PostgreSQL (`SELECT 1`) and Redis (`PING`)
            ├── products/search/route.ts              # Public `GET` endpoint performing `pg_trgm` similarity + `ILIKE` search on confirmed products
            ├── receipts/upload/route.ts              # Protected `POST` endpoint validating 50MB limit, batch / stitch modes, preprocessing & queueing
            ├── receipts/[id]/file/route.ts           # Protected `GET` endpoint streaming stored `.webp` or `.pdf` files from `/app/uploads`
            └── receipts/[id]/status/route.ts         # Protected `GET` endpoint polled by `/upload` to track `PENDING -> PROCESSING -> REVIEW` state
```

---

## Section D: Database Schema & Key Queries Reference

### 1. Prisma Models Summary (`prisma/schema.prisma`)
- **`User`**: `id`, `username` (`@unique`), `password` (bcrypt hash), `role` (`USER` | `ADMIN`), `enabled`, `receipts`.
- **`Store`**: `id`, `name` (`@unique`), `slug` (`@unique`), `brandHex` (official supermarket color for charts/badges), `receipts`, `aliases`.
- **`Receipt`**: `id`, `userId`, `storeId`, `purchaseDate`, `totalAmount` (`Decimal(10,2)`), `sourceFile`, `fileHash` (`@unique` SHA-256), `aiProvider`, `processingMs`, `status` (`PENDING` | `PROCESSING` | `REVIEW` | `CONFIRMED` | `FAILED`), `taxBreakdown` (`Json?` array of `{ rate, baseAmount, taxAmount }`), `items`.
  - Indexed on `@@index([storeId, purchaseDate(sort: Desc)])`, `@@index([userId, purchaseDate(sort: Desc)])`, and `@@index([status])`.
- **`Product`**: `id`, `slug` (`@unique`), `displayName`, `category`, `baseUnit` (`KG` | `L` | `UNIT`), `isStaple` (`Boolean`), `aliases`, `receiptItems`.
  - Indexed on `@@index([category])` and `@@index([isStaple])`. Uses PostgreSQL `pg_trgm` for fuzzy matching on `displayName`.
- **`ProductAlias`**: `id`, `rawAlias` (exact uppercase POS string, e.g. `"LECHE ENT HACENDADO"`), `storeId`, `productId`, `unitMeasurePerPack` (`Decimal(10,3)?`, net content per 1 pack/bottle), `isVariableWeight` (`Boolean`, true if weighed at checkout).
  - Enforces **`@@unique([storeId, rawAlias])`** for `100%` deterministic auto-matching and automated pack-size application on subsequent receipts from the same chain.
- **`ReceiptItem`**: `id`, `receiptId`, `productId`, `rawName`, `suggestedName`, `suggestedCat`, `matchConfidence` (`0` to `1.0`), `quantity` (`Decimal(10,3)`), `unitPrice` (`Decimal(10,2)`), `totalPrice` (`Decimal(10,2)`), `baseUnit` (`KG` | `L` | `UNIT`), `unitMeasure` (`Decimal(10,3)`), `pricePerBaseUnit` (`Decimal(10,2)`), `isDiscount`, `excluded`, `confirmed`.
  - Indexed on `@@index([productId, confirmed, excluded])` and `@@index([receiptId])`.

### 2. Unit Price (`unitPrice`) vs. Normalized Base Price (`pricePerBaseUnit`)
- **`unitPrice` (`Pack €`)**: The shelf price of a single package or weighted item as printed on the receipt (e.g., `€5.40` for a 6-pack of 1L milk, or `€3.97` for a tray of chicken breast).
- **`unitMeasure`**: Total canonical quantity of `baseUnit` contained in the line item (e.g., `6.000` L for a 6x1L pack; `0.547` KG for 547g of fruit/meat; `12` UNIT for a dozen eggs).
- **`pricePerBaseUnit` (`€/kg`, `€/L`, `€/ud`)**: Calculated as `round(totalPrice / unitMeasure, 2)`. This enables true apple-to-apples comparisons across different pack sizes and supermarket chains.
- **Public Catalogue Visibility Rule**: Public pages (`/`, `/products`, `/products/[slug]`, `/compare`, `/stores/[slug]`) **only** query items where `confirmed: true`, `excluded: false`, and `receipt.status: "CONFIRMED"`.

---

## Section E: Deployment & Environment Reference

- **Docker Image & Deployment:** Run via root `docker-compose.yml` or build locally from `Dockerfile`.
- **Persistent Volumes & Storage:**
  - Receipts Upload Volume: `/app/uploads` (stores compressed WebP and original receipt PDFs)
  - PostgreSQL Database: named volume `postgres_data`
  - Redis Queue Cache: named volume `redis_data`
- **Required Environment Variables:**
  - `DATABASE_URL`: PostgreSQL connection string with `pg_trgm` extension
  - `REDIS_URL`: Redis connection string for BullMQ queue
  - `AUTH_SECRET` / `NEXTAUTH_SECRET`: Random 32+ byte string (`openssl rand -base64 32`)
  - `AUTH_TRUST_HOST=true`: Required for reverse proxies
  - `PUBLIC_CATALOG`: "false" (default, private instance) or "true" (public catalogue)
  - `INITIAL_ADMIN_USER` & `INITIAL_ADMIN_PASSWORD`: Optional initial admin setup
  - `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`: OCR/parsing failover cascade
- **PWA Install Requirement:** Modern browsers (Chrome, Edge, Brave, Safari) require HTTPS for PWA installation and service worker activation. Ensure the reverse proxy terminates SSL/TLS.
