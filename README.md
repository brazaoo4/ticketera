<div align="center">

# 🧾 Ticketera

**Self-hosted Spanish grocery receipt scanner, unit-price normalizer, and personal inflation platform.**

[![CI/CD](https://github.com/brazaoo4/ticketera/actions/workflows/pipeline.yml/badge.svg)](https://github.com/brazaoo4/ticketera/actions/workflows/pipeline.yml)
[![GHCR Container](https://img.shields.io/badge/Container-GHCR-181717?logo=github)](https://github.com/brazaoo4/ticketera/pkgs/container/ticketera)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16_pg__trgm-336791?logo=postgresql)](https://www.postgresql.org)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)

*Built for personal use on a homelab server to track real grocery inflation across Spanish supermarkets. Open-sourced if you find it helpful.*

[Why Ticketera?](#-why-ticketera) • [Quick Start](#-quick-start-docker-compose) • [Demo Mode](#-1-click-demo-mode) • [Features](#-key-features) • [Architecture](#%EF%B8%8F-system-architecture) • [Environment Variables](#%EF%B8%8F-environment-variables)

</div>

---

> I built Ticketera because tracking grocery inflation in Spain across Mercadona, Lidl, Carrefour, Consum, and DIA was infuriating. Cryptic POS abbreviations (`PECHUGA POLLO BANDEJ`, `LECHE ENT MILBONA 1L`), stealth shrinkflation (cookies shrinking from 500g to 420g overnight at the same price), and mixed packaging formats made it impossible to know if I was spending more or simply buying less. It runs quietly on my homelab server with local AI OCR and failover—extracting items, catching stealth reductions, and computing my real personal IPC.

---

## 💡 Why Ticketera?

| Challenge | Manual Spreadsheets | Generic Expense Apps | 🧾 Ticketera |
| :--- | :--- | :--- | :--- |
| **Receipt Entry** | ❌ Tedious manual typing | ⚠️ Manual total amount only | **✅ Auto OCR & Line-Item Extraction (Gemini / Groq / OpenAI)** |
| **Format Discrepancies** | ❌ 6x1L brick vs 1.5L bottle mixed up | ❌ No line-item or package awareness | **✅ Automated Base-Unit Normalization (`€/kg`, `€/L`, `€/unit`)** |
| **Shrinkflation Detection** | ❌ Blind to stealth size drops | ❌ Completely unaware | **✅ Pure SQL Shrinkflation Radar & Timeline Alerts** |
| **Spanish Grocery Taxes** | ❌ Manual tax computation | ❌ Single lump sum | **✅ Automatic Printed IVA Breakdown (0%–4%, 5%–10%, 21%)** |
| **Supermarket Pricing** | ❌ Incomplete single-store view | ❌ No multi-store basket comparison | **✅ Multi-Store Comparator & Smart Split Basket Route** |
| **Data Ownership** | ⚠️ Cloud-dependent / local files | ❌ Commercial bank aggregators | **✅ 100% Self-Hosted, PostgreSQL 16 & One-Click Portability** |

---

## 🐳 Quick Start: Server Deployment

Create a `docker-compose.yml` file (or paste into Dockhand / Portainer) and launch the stack:

```yaml
services:
  app:
    image: ghcr.io/brazaoo4/ticketera:latest
    container_name: ticketera-app
    restart: unless-stopped
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    ports:
      - "3000:3000"
    environment:
      # ========================================================================
      # 1. CORE SERVER SETTINGS
      # ========================================================================
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - NEXT_PUBLIC_APP_URL=http://localhost:3000
      - UPLOAD_DIR=/app/uploads

      # Database & Redis Connections (Internal Docker Network)
      - DATABASE_URL=postgresql://ticket:change-me@postgres:5432/ticketera?schema=public
      - REDIS_URL=redis://redis:6379/0

      # ========================================================================
      # 2. SECURITY & AUTHENTICATION
      # ========================================================================
      # Generate secure random secrets with: openssl rand -base64 32
      - AUTH_SECRET=change_this_auth_secret_with_openssl_rand_base64_32
      - NEXTAUTH_SECRET=change_this_auth_secret_with_openssl_rand_base64_32
      - AUTH_TRUST_HOST=true

      # Catalog Access: "false" requires login; "true" enables public viewing
      - PUBLIC_CATALOG=false

      # Optional initial admin credentials bootstrapped on empty database
      - INITIAL_ADMIN_USER=admin
      - INITIAL_ADMIN_PASSWORD=

      # ========================================================================
      # 3. AI OCR PROVIDERS (At least one key required for receipt OCR)
      # ========================================================================
      # Primary Vision Model (Recommended & Free Tier available):
      - GEMINI_API_KEY=
      # Multimodal Fallbacks (Optional):
      - GROQ_API_KEY=
      - OPENAI_API_KEY=
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    container_name: ticketera-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ticket
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: ticketera
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ticket -d ticketera"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ticketera-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  uploads_data:
  postgres_data:
  redis_data:
```

### 1-Liner Quick Download
```bash
mkdir ticketera && cd ticketera
curl -O https://raw.githubusercontent.com/brazaoo4/ticketera/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/brazaoo4/ticketera/main/.env.example
cp .env.example .env
# Edit .env with your generated secrets and GEMINI_API_KEY:
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> [!TIP]
> **First Login Onboarding:** If no users exist, the very first user who signs in through the `/login` screen automatically claims the root **ADMIN** account. Alternatively, provide `INITIAL_ADMIN_USER` and `INITIAL_ADMIN_PASSWORD` in your environment.

---

## 🚀 Key Features

### 📸 Ingestion & Receipt Intelligence
- **Multi-Receipt Batch Upload:** Drop up to 15 receipts at once with parallel background processing via BullMQ.
- **Long Receipt Vertical Stitcher:** Drop 2–3 photos of long paper tickets; Ticketera stitches them vertically into a single normalized image via `sharp` before OCR.
- **Ordered AI Failover Cascade:** Ingests receipts through **Google Gemini 2.5 Flash** (Primary free tier) $\rightarrow$ **Groq Llama 4 Scout** (Fast multimodal fallback) $\rightarrow$ **OpenAI GPT-4o-mini** (Tertiary fallback).
- **Fast Digital PDF Parsing:** Digital app tickets (Mercadona, Lidl Plus) parse raw text with instant latency before falling back to vision models.
- **Image Compression Pipeline:** Processed receipts are re-encoded to compact WebP, minimizing disk usage while preserving OCR legibility.

### ⚡ 15-Second Split-Screen Review Workstation
- Original receipt image/PDF sits sticky on the left with interactive zoom and pan.
- Interactive line-item editor with **`Δ €0.00` Math Sanity Bar**, verifying that item subtotals match the receipt's printed total.
- **One-Click Supermarket Catalog Lookup:** Integrated OpenFoodFacts Spain lookup with store-brand matching (Hacendado, Milbona, etc.) to autofill package weights and canonical names.
- **Rapid "Confirm & Next Pending" Queue:** Confirming trained aliases saves memory rules (`unitMeasurePerPack`, `isVariableWeight`), auto-applying sizes to subsequent tickets in the batch.

### 📊 Deep Inflation & Grocery Intelligence
- **"Tu IPC Real" (Personal Inflation Rate):** Computes your consumption-weighted personal inflation index against a general staple basket benchmark.
- **Shrinkflation Radar ("Radar de Reduflación"):** Detects stealth pack reductions ($\ge 5\%$) where the shelf pack price remained identical ($\pm 10\%$) while the price per kg or liter spiked ($\ge 5\%$).
- **Spanish Grocery Tax & IVA Tracker:** Visualizes printed tax breakdown tables (0%–4% Superreducido, 5%–10% Reducido, 21% General) and tracks effective tax rates over time.
- **Multi-Store Basket Comparator (`/compare`):** Select products to simulate weekly shopping across chains, comparing single-store totals against a "Smart Split Basket" optimal route.
- **Custom Supermarkets:** Track national chains (**Mercadona, Lidl, Carrefour, Alcampo, Consum, DIA, Aldi, MAS, Cash Fresh**) or add custom regional chains (**Eroski, BM, Ahorramas, Bonpreu, Gadis, HiperDino**) with custom brand colors.

### 📱 Progressive Web App (PWA) & Data Portability
- **Installable PWA:** Full offline fallback and standalone app mode on Android and iOS.
- **Native Android Share Target (`POST /upload-share`):** Share a PDF receipt directly from your supermarket app (Mercadona, Lidl Plus) into Ticketera without downloading it first.
- **One-Click Export:** Download full Excel-safe UTF-8 BOM CSVs (`items_csv`, `receipts_csv`) or complete structured JSON backups anytime.

---

## 🧪 1-Click Demo Mode

Evaluating Ticketera or testing without scanning receipts?
- When starting on an empty database, a **"Cargar Datos Demo"** prompt appears on the homepage and statistics page.
- You can also toggle demo mode anytime via CLI:
  ```bash
  # Load realistic 6-month Spanish grocery dataset (Mercadona, Lidl, Carrefour, Consum, DIA)
  npm run demo:load

  # Purge all demo receipts and placeholder files cleanly
  npm run demo:clear
  ```
- Demo receipts are safely isolated with `demo-seed-` IDs. Exiting demo mode removes all demo receipts, placeholder files, and orphaned demo products in a single database transaction.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://ticket:change-me@postgres:5432/ticketera` | PostgreSQL connection string (requires `pg_trgm` extension) |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL for BullMQ worker queue |
| `AUTH_SECRET` | *required* | Random 32+ byte secret used to sign Auth.js session JWT tokens |
| `AUTH_TRUST_HOST` | `true` | Enables running behind reverse proxies (Nginx, Traefik, Cloudflare Tunnel) |
| `PUBLIC_CATALOG` | `false` | When `false` (default), all pages require login. When `true`, public catalog and compare routes are accessible without sign-in |
| `INITIAL_ADMIN_USER` | `admin` | Optional root admin username bootstrapped on an empty database |
| `INITIAL_ADMIN_PASSWORD` | *(empty)* | Optional root admin password bootstrapped on an empty database |
| `GEMINI_API_KEY` | *(optional)* | Google Gemini API key (Primary vision model: `gemini-2.5-flash`) |
| `GROQ_API_KEY` | *(optional)* | Groq API key (First fallback: multimodal Llama 4 Scout) |
| `OPENAI_API_KEY` | *(optional)* | OpenAI API key (Second fallback: `gpt-4o-mini`) |
| `UPLOAD_DIR` | `/app/uploads` | Path to persistent storage for receipt images and PDFs |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical instance URL (used for PWA manifest & OpenFoodFacts User-Agent) |

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Ingestion["1. Ingestion & Preprocessing"]
        A1["Receipt Upload (Photo / PDF / Multi-photo)"] --> A2["Sharp Contrast / Vertical Stitching / pdf-parse"]
        A2 --> A3["BullMQ Background Job (Redis)"]
    end

    subgraph AI_Cascade["2. AI Structured OCR Failover"]
        B1["Google Gemini 2.5 Flash (Primary)"] -->|Fallback on Rate Limit| B2["Groq Multimodal (Secondary)"]
        B2 -->|Fallback| B3["OpenAI GPT-4o-mini (Tertiary)"]
    end

    subgraph Matching["3. Alias & Product Resolution"]
        C1["Exact Match: Store ProductAlias"]
        C2["Fuzzy Match: PostgreSQL pg_trgm"]
        C3["OpenFoodFacts Spain Catalog Lookup"]
    end

    subgraph Review["4. 15-Second Split-Screen Workstation"]
        D1["Visual Receipt Evidence + Math Sanity Bar"]
        D2["Confirm & Next -> Trains ProductAlias Invariants"]
    end

    subgraph Analytics["5. Public & Personal Price Intelligence"]
        E1["Recharts Multi-Store Price Evolution"]
        E2["Radar de Reduflación (Shrinkflation Engine)"]
        E3["Tu IPC Real (Consumption-Weighted Inflation)"]
        E4["El Impacto del IVA (Tax Bracket Tracker)"]
    end

    A3 --> AI_Cascade
    AI_Cascade --> Matching
    Matching --> Review
    Review --> Analytics
```

---

## 💻 Local Development

### Prerequisites
- Node.js 22+
- PostgreSQL 16 (with `pg_trgm` extension)
- Redis 7+

### Setup
```bash
git clone https://github.com/brazaoo4/ticketera.git
cd ticketera

# Install dependencies
npm install

# Start auxiliary database and redis via compose
docker compose up -d postgres redis

# Configure environment
cp .env.example .env

# Generate Prisma client and synchronize database schema
npx prisma generate
npx prisma db push
npm run dev
```

### Code Quality & Automated Tests
```bash
npm test             # Automated unit test suite
npm run typecheck    # TypeScript compiler check
npm run lint         # ESLint validation
npm run build        # Production Next.js build
```

---

## 🔒 Security & Privacy

- **Private by Default (`PUBLIC_CATALOG=false`):** By default, every route and API endpoint requires authentication. You have full control over whether your catalog is publicly readable or strictly private.
- **No Hardcoded Superusers:** Non-superuser database privileges are enforced. Initial admin accounts are securely hashed with bcrypt.
- **AI Privacy Consideration:** Receipt scans and PDF ticket text are sent to your configured AI provider (Google Gemini, Groq, or OpenAI) for OCR processing. Supermarket receipts rarely contain personal data beyond masked payment card digits (`**** **** **** 1234`).
- **PWA HTTPS Prerequisite:** Modern browsers require an SSL/TLS connection (HTTPS) to enable service workers and PWA installation. When self-hosting, place Ticketera behind an HTTPS reverse proxy (such as Caddy, Nginx, or Cloudflare Tunnel).

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.  
Copyright (C) 2026 Bruno Brazão.

See [LICENSE](LICENSE) for details.
