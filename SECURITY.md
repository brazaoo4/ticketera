# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| < 2.0.0 | :x:                |

## Reporting a Vulnerability

We take the security of Ticketera seriously. If you discover a vulnerability or potential security risk, please do **NOT** open a public issue.

Instead, report it via:
* **GitHub Private Advisory**: Submit securely via [GitHub Private Vulnerability Reporting](https://github.com/brazaoo4/ticketera/security/advisories/new).
* **Email**: Send detailed findings to **brunobrazao4@gmail.com**.

Please include:
1. Detailed description of the vulnerability.
2. Steps to reproduce or proof-of-concept payload.
3. Potential impact on confidential receipts or host infrastructure.
4. Suggested remediation if available.

You will receive an acknowledgment within 48 hours and regular updates on triage and patching.

---

## Security Architecture & Built-In Defenses

Ticketera is engineered with defensive safeguards designed to protect personal financial data and host servers:

1. **Private by Default (`PUBLIC_CATALOG=false`)**:
   - All catalog viewing, price charts, statistics, and review pages require authenticated sessions unless explicitly toggled to public by an administrator in `/admin/settings`.
2. **Redis-Backed Rate Limiting**:
   - Sliding-window rate limiters guard API endpoints (such as OpenFoodFacts catalog lookups, file uploads, and authentication attempts) against denial-of-service and brute-force attacks.
3. **Session Integrity & Active Account Verification**:
   - Authenticated sessions verify that user accounts remain `enabled: true` in PostgreSQL on protected server actions and API routes.
4. **MIME Magic-Bytes Validation & Decompression Bomb Caps**:
   - File uploads inspect binary magic bytes (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) rather than trusting user-supplied file extensions.
   - Image preprocessing pipelines enforce hard resolution and memory caps to mitigate decompression bomb vulnerabilities before passing buffers to `sharp`.
5. **IDOR & Multi-Tenant Ownership Authorization**:
   - Receipt files, sightings, review actions, and personal statistics queries enforce strict user ownership checks (`receipt.userId === session.user.id`) to prevent Insecure Direct Object References.
6. **Hardened HTTP Response Headers**:
   - Global HTTP headers enforce `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict referrer policies across all application routes.
7. **Sanitized Healthcheck Telemetry**:
   - Public healthcheck endpoints (`/api/health`) perform internal connectivity tests against PostgreSQL and Redis without leaking system statistics, user counts, or database credentials.
