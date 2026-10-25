<div align="center">

# 🧾 Ticketera

**Self-hosted Spanish grocery receipt scanner, unit-price normalizer, and personal inflation platform.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_pg__trgm-336791?logo=postgresql)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com)
[![GHCR](https://img.shields.io/badge/Container-GHCR-181717?logo=github)](https://github.com/brazaoo4/ticketera/pkgs/container/ticketera)

[Features](#-key-features) • [Quick Start](#-quick-start-docker-compose) • [Demo Mode](#-1-click-demo-mode) • [Configuration](#-environment-variables) • [Architecture](#-architecture) • [Security & Privacy](#-security--privacy)

</div>

---

## 🎯 The Problem & The Solution

Tracking supermarket inflation in Spain is messy:
- Every supermarket uses cryptic POS abbreviations (`PECHUGA POLLO BANDEJ`, `LECHE ENT MILBONA 1L`, `HUEVOS CAMPEROS DOC`).
- Supermarkets frequently adjust package sizes to mask price hikes (**Shrinkflation / Reduflación**)—for instance, shrinking cookies from 500g to 420g while keeping the price at €1.75.
- Comparing a 6x1L milk pack to a single 1L brick or a 5L oil jug to a 1L bottle requires accurate base unit normalization (`€/kg`, `€/L`, `€/unit`).

**Ticketera** solves this through automated receipt OCR, deterministic pack-size memory, and consumption-weighted price analytics. Simply drop a receipt photo or digital PDF; the AI extracts every line item, normalizes units, calculates tax breakdowns, and continuously trains local POS aliases so subsequent purchases match instantaneously.

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

## 🐳 Quick Start (Docker Compose)

### 1. Download `docker-compose.yml` and `.env.example`
```bash
mkdir ticketera && cd ticketera
curl -O https://raw.githubusercontent.com/bruBraz/ticketera/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/bruBraz/ticketera/main/.env.example
cp .env.example .env
```

### 2. Configure Environment (`.env`)
Generate secrets and add at least one AI API key (Gemini is free and recommended):
```bash
# Generate secure auth secrets
openssl rand -base64 32
```
Edit `.env`:
```env
AUTH_SECRET=your_generated_secret_here
NEXTAUTH_SECRET=your_generated_secret_here

# At least one AI key required for receipt OCR:
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Launch with Docker Compose
```bash
docker compose up -d
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

> [!TIP]
> **First Login Onboarding:** If no users exist, the very first user who signs in through the `/login` screen automatically claims the root **ADMIN** account. Alternatively, set `INITIAL_ADMIN_USER` and `INITIAL_ADMIN_PASSWORD` in your `.env` to bootstrap credentials automatically on startup.

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

### Code Quality & Validation
```bash
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
