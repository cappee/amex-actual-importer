# amex-actual-importer v2

> **Status: under development** — v2 is a full rewrite, not production-ready yet.

Syncs American Express Italia transactions to [Actual Budget](https://actualbudget.org/) via `@actual-app/api`. Authenticates with MFA (OTP via email), runs as a daily systemd timer on a VPS.

**Note:** v2 uses reverse-engineered AMEX web APIs.

## Requirements

- Node.js ≥ 20
- IMAP access to the email account that receives AMEX OTPs
- A reachable Actual Budget instance

## Setup

```bash
npm install
cp .env.example .env
# fill in .env, then encrypt sensitive values:
npm run encrypt
```

The encryption key must live outside `.env`:

```bash
export AMEX_ACTUAL_IMPORTER_ENCRYPTION_KEY="your-secret-key"
```

## Usage

```bash
npm run dev      # run directly with tsx (development)
npm run build    # compile TypeScript → dist/
npm start        # run compiled output (production)
npm test         # unit tests
npm run lint     # type check only
```

## Deploy

Install as a systemd service + daily timer (`scripts/install-systemd.sh`).

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime error (auth, network, IMAP, Actual) |
| `2` | Configuration error |
