# Contributing to Ticketera

Thank you for your interest in contributing to **Ticketera**!

Ticketera is a self-hosted Spanish grocery receipt scanner, unit-price normalizer, and personal inflation tracking platform.

---

## 🛠️ Development Setup

### Prerequisites

* Node.js 22+ (or compatible LTS)
* PostgreSQL 16+ (with `pg_trgm` extension)
* Redis 7+ (for BullMQ queue processing)
* Docker & Docker Compose (optional, for running local auxiliary services)

### Local Environment Setup

```bash
# Clone your fork or the repository
git clone https://github.com/brazaoo4/ticketera.git
cd ticketera

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Start auxiliary database and Redis containers
docker compose up -d postgres redis

# Generate Prisma Client and sync schema
npx prisma generate
npx prisma db push

# Optional: Load realistic 6-month Spanish grocery demo dataset
npm run demo:load

# Start Next.js development server
npm run dev
```

---

## 📐 Architectural Guardrails for Contributors

When modifying Ticketera, you must strictly adhere to the following core invariants:

1. **Zero Infrastructure or Dev Clutter in UI**:
   - Never display server hostnames, IP addresses, database slugs (`slug: ...`), raw hex codes (`#10b981`), or database engine names (`PostgreSQL`, `Redis`, `BullMQ`) anywhere in the user-facing frontend.
2. **100% Database-Driven**:
   - Never introduce hardcoded product arrays, mock staple lists, or synthetic search suggestions into frontend components or startup hooks.
   - All search suggestions, products, supermarket counts, and price charts must query PostgreSQL via Prisma (`Product`, `ReceiptItem`, `Receipt`, `Store`).
3. **Single-Line Button & Badge Constraint**:
   - Every button, badge, navigation pill, and link must include `whitespace-nowrap shrink-0` so text never awkwardly wraps across multiple lines.
4. **Strict Base-Unit Normalization**:
   - All receipt line items and catalog entries must normalize strictly to canonical units:
     - Weight: `KG` (normalized as `€/kg`)
     - Volume: `L` (normalized as `€/L`)
     - Count: `UNIT` (normalized as `€/unit`)
5. **Tabular Numerals**:
   - Numeric prices, percentages, dates, and currency values must include Tailwind `tabular-nums` for clean visual alignment.

---

## 📝 Commit Conventions (Release Please)

This repository uses **[Conventional Commits](https://www.conventionalcommits.org/)** to drive automated semantic versioning, changelog generation, and multi-arch Docker image publishing via **Google Release Please**:

| Prefix | Semantic Version Bump | Usage |
| :--- | :--- | :--- |
| `feat:` | **Minor** (`2.1.0` → `2.2.0`) | New feature, analytics capability, or supermarket integration. |
| `fix:` | **Patch** (`2.1.0` → `2.1.1`) | Bug fix or calculation error correction. |
| `perf:` | **Patch** | Performance optimization (database indexes, query speed, image processing). |
| `docs:` | None (or patch if configured) | Documentation, guide, or README updates. |
| `refactor:` | None (or patch if configured) | Code refactoring without behavior changes. |
| `test:` | None | Adding or correcting automated tests. |
| `chore:` | None | Dependency updates, CI/CD tweaks, maintenance. |

> [!TIP]
> Breaking changes should append `!` after the prefix (e.g. `feat!: change default storage layout`) or include `BREAKING CHANGE:` in the commit footer to trigger a **Major** version bump.

---

## 🚀 Pull Request Guidelines

1. Create a feature branch off `main`: `git checkout -b feat/my-new-feature`.
2. Write clean code and accompanying unit tests under `tests/`.
3. Verify that all checks pass locally:
   ```bash
   npm test             # Unit test suite
   npm run typecheck    # TypeScript compiler check
   npm run lint         # ESLint validation
   npm run build        # Production Next.js build
   ```
4. Push your branch to GitHub and open a Pull Request against `main`. Fill in the PR template thoroughly.

---

## 📄 License

By contributing to Ticketera, you agree that your contributions will be licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.
