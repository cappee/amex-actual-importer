# amex-actual-importer

Automatically import American Express Italia transactions into [Actual Budget](https://actualbudget.org).

## How it works

1. Logs into your Amex Italia account using a headless browser (with 2FA support via IMAP)
2. Fetches all recent transactions
3. Imports them into Actual Budget via the [@actual-app/api](https://www.npmjs.com/package/@actual-app/api), deduplicating by transaction ID

## Prerequisites

- **Node.js** 22+
- An **Actual Budget** server instance
- An **IMAP email account** (e.g. Gmail) where you receive Amex 2FA codes
  - For Gmail: create an [App Password](https://myaccount.google.com/apppasswords) and use it as `IMAP_PASSWORD`

## Setup

There are two ways to run amex-actual-importer: as an **npm package** with system cron, or via **Docker**.

### Option 1 — npm + cron

#### 1. Configure

Create a working directory and a `.env` file:

```bash
mkdir ~/amex-sync && cd ~/amex-sync
```

Copy the environment variables from [`.env.example`](.env.example) into a new `.env` file and fill in your credentials.

#### 2. Login (requires a display)

Run the login command on your local machine (not the server). A browser window will open for you to log in manually:

```bash
npx @cappee/amex-actual-importer login
```

This saves session cookies to `amex.json` in the current directory.

#### 3. Deploy to server

Copy the `.env` and `amex.json` files to your server:

```bash
scp .env amex.json user@yourserver:~/amex-sync/
```

#### 4. Schedule with cron

```bash
crontab -e
```

Add a line to run the import on a schedule (e.g. every 4 hours):

```
0 */4 * * * cd ~/amex-sync && npx @cappee/amex-actual-importer import >> ~/amex-sync/sync.log 2>&1
```

### Option 2 — Docker

#### 1. Clone the repository

```bash
git clone https://github.com/cappee/amex-actual-importer.git
cd amex-actual-importer
```

#### 2. Install dependencies and build

```bash
npm install && npm run build
```

#### 3. Login (requires a display)

```bash
node dist/index.js login
```

This saves session cookies to `amex.json`.

#### 4. Configure

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

If your Actual Budget server runs in Docker on the same machine, you can use `http://actual-server:5006` as `ACTUAL_SERVER_URL` (the included `docker-compose.yml` sets up a shared network).

#### 5. Deploy and run

Copy the project to your server (make sure `amex.json` and `.env` are included), then build and start:

```bash
docker compose up -d --build
```

The container runs an import immediately on startup, then every 4 hours (configurable via `SYNC_CRON` in `.env`).

## Commands

| Command | Description |
|---|---|
| `npx @cappee/amex-actual-importer login` | Open a browser to log in manually and save cookies to `amex.json` |
| `npx @cappee/amex-actual-importer import` | Run a single import (fetch from Amex, import into Actual) |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AMEX_USERNAME` | Yes | | Amex Italia user ID |
| `AMEX_PASSWORD` | Yes | | Amex Italia password |
| `IMAP_HOST` | Yes | | IMAP server host (e.g. `imap.gmail.com`) |
| `IMAP_PORT` | No | `993` | IMAP server port |
| `IMAP_USER` | Yes | | IMAP username / email |
| `IMAP_PASSWORD` | Yes | | IMAP password (use App Password for Gmail) |
| `IMAP_FOLDER` | No | `INBOX` | IMAP folder to search for 2FA emails |
| `ACTUAL_SERVER_URL` | Yes | | Actual Budget server URL |
| `ACTUAL_PASSWORD` | Yes | | Actual Budget server password |
| `ACTUAL_SYNC_ID` | Yes | | Budget sync ID (from Actual settings) |
| `ACTUAL_ENCRYPTION_PASSWORD` | No | | End-to-end encryption password (if enabled) |
| `ACTUAL_DATA_DIR` | No | `./actual-data` | Directory for Actual API local cache |
| `ACCOUNT_MAPPING` | Yes | | Amex account token to Actual account ID mapping (see below) |
| `AUTH_JSON_PATH` | No | `./amex.json` | Path to the cookies file |
| `PROXY_URL` | No | | SOCKS5/HTTP proxy URL |
| `SYNC_CRON` | No | `0 */4 * * *` | Cron schedule (Docker mode only) |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |

### Account mapping

The `ACCOUNT_MAPPING` variable maps Amex account tokens to Actual account IDs.

```
ACCOUNT_MAPPING=AMEX_TOKEN_1:ACTUAL_ID_1,AMEX_TOKEN_2:ACTUAL_ID_2
```

- **Amex account token**: found in the URL when viewing an account on the Amex website (e.g. `https://global.americanexpress.com/activity/recent?token=XXXXXXXXXXXX`)
- **Actual account ID**: found in the Actual Budget URL when viewing an account (e.g. `https://actual.example.com/accounts/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## Cookie expiration

The `amex.json` file contains session cookies that expire after some time. When the import fails with an authentication error, you need to re-run `npx @cappee/amex-actual-importer login` on your local machine and copy the updated `amex.json` to the server (or rebuild the Docker image).

## License

ISC
