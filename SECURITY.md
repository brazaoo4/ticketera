# Security Policy

## Reporting a Vulnerability

We take the security of Ticketera seriously. If you discover a security vulnerability, please do **NOT** open a public issue.

Instead, please send an email to **brunobrazao4@gmail.com** with details of the vulnerability, including:
- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

You should receive an acknowledgment within 48 hours.

## Security Practices
- **Local Credential Storage:** Always generate random secrets using `openssl rand -base64 32` for `AUTH_SECRET` and `NEXTAUTH_SECRET`.
- **Database Hardening:** Ticketera runs without superuser database privileges. Ensure your PostgreSQL connection user only has permissions on the `ticketera` database.
- **Privacy Default:** By default, `PUBLIC_CATALOG=false`, ensuring all catalog and price data requires user authentication.
- **AI Privacy Notice:** Optical Character Recognition (OCR) and item extraction send receipt image/text data to the configured AI API providers (Google Gemini, Groq, or OpenAI). Do not upload receipts containing sensitive payment card numbers beyond standard masked digits.
