# Contributing to Ticketera

Thank you for your interest in contributing to **Ticketera**!

## Getting Started

1. **Fork the Repository:** Fork on GitHub and clone your fork locally.
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Setup Environment:**
   ```bash
   cp .env.example .env
   ```
   Start local PostgreSQL (with `pg_trgm` extension) and Redis instances, or use Docker Compose:
   ```bash
   docker compose up -d postgres redis
   ```
4. **Generate Prisma Client & Run Initial Seed:**
   ```bash
   npx prisma generate
   npm run dev
   ```
5. **Load Demo Dataset (Optional):**
   ```bash
   npm run demo:load
   ```

## Development Workflow & Rules

- **Strict UI Rules:**
  - Zero server hostnames, raw hex codes, database slugs, or debugging clutter in the UI.
  - Buttons, badges, and navigation links must use single-line formatting (`whitespace-nowrap shrink-0`).
  - Use `tabular-nums` for prices, units, and percentage changes.
- **Type Safety & Quality Checks:**
  Before submitting a PR, make sure all checks pass:
  ```bash
  npm run typecheck
  npm run lint
  npm run build
  ```

## Submitting Pull Requests

1. Create a feature branch (`git checkout -b feature/my-new-feature`).
2. Commit changes with clear, semantic commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
3. Push to your branch and open a Pull Request.

## License

By contributing to Ticketera, you agree that your contributions will be licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.
