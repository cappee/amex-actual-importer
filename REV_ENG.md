# American Express Italia — Internal API Reference

Reverse-engineered API documentation for American Express Italy (`global.americanexpress.com`). No public API exists — these endpoints power the web frontend.

## Endpoints

| Base URL | Purpose |
|----------|---------|
| `https://global.americanexpress.com` | Login, transactions |
| `https://functions.americanexpress.com` | MFA, session management |

## Authentication Flow

All requests in a login flow must share the same `one-data-correlation-id` UUID header.

### 1. Login

```http
POST /myca/logon/emea/action/login
Host: global.americanexpress.com
Content-Type: application/x-www-form-urlencoded; charset=utf-8
challengeable: ON
one-data-correlation-id: <uuid>
```

Form fields:

```
request_type=login
Face=it_IT
Logon=Logon
version=4
inauth_profile_transaction_id=LOGIN-<uuid>
DestPage=https://global.americanexpress.com/dashboard
UserID=<username>
Password=<password>
channel=Web
REMEMBERME=off
b_hour=<HH>&b_minute=<MM>&b_second=<SS>
b_dayNumber=<DD>&b_month=<MM>&b_year=<YYYY>
b_timeZone=<offset>
```

Response (`statusCode: 1` = MFA required, `0` = direct login):

```json
{
  "statusCode": 1,
  "reauth": {
    "actionId": "MFAOI01",
    "applicationId": "LOGON01",
    "mfaId": "<mfa_id>",
    "assessmentToken": "<token>"
  }
}
```

Sets cookie `aat` (JWT, HTTP-only, ~5 min TTL) which authenticates all subsequent calls.

### 2. Read MFA Challenges

```http
POST /ReadAuthenticationChallenges.v3
Host: functions.americanexpress.com
Content-Type: application/json; charset=UTF-8
one-data-correlation-id: <uuid>
```

```json
{
  "userJourneyIdentifier": "aexp.global:create:session",
  "assessmentToken": "<from login response>",
  "meta": {
    "authenticationActionId": "<reauth.actionId>",
    "applicationId": "<reauth.applicationId>",
    "locale": "it-IT"
  }
}
```

Response:

```json
{
  "challenge": "(OTP_SMS | OTP_EMAIL)",
  "challengeQuestions": [{
    "category": "OTP_SMS",
    "challengeOptions": [{
      "type": "OTP",
      "maskedValue": "********1234",
      "encryptedValue": "<encrypted>"
    }]
  }, {
    "category": "OTP_EMAIL",
    "challengeOptions": [{
      "type": "OTP",
      "maskedValue": "u***@gmail.com",
      "encryptedValue": "<encrypted>"
    }]
  }]
}
```

### 3. Send OTP

```http
POST /CreateOneTimePasscodeDelivery.v3
Host: functions.americanexpress.com
Content-Type: application/json; charset=UTF-8
one-data-correlation-id: <uuid>
```

```json
{
  "userJourneyIdentifier": "aexp.global:create:session",
  "otpDeliveryRequest": {
    "deliveryMethod": "EMAIL",
    "encryptedValue": "<from challenge option>"
  },
  "locale": "it-IT"
}
```

`deliveryMethod`: `"EMAIL"`, `"SMS"`, or `"VOICE"`.

Response:

```json
{
  "validityDuration": 10,
  "validityUnit": "MINUTES",
  "remainingAttempts": 0,
  "encryptedChannelValue": "<encrypted>"
}
```

### 4. Verify OTP

```http
POST /UpdateAuthenticationTokenWithChallenge.v3
Host: functions.americanexpress.com
Content-Type: application/json; charset=UTF-8
one-data-correlation-id: <uuid>
```

```json
{
  "userJourneyIdentifier": "aexp.global:create:session",
  "assessmentToken": "<from login>",
  "challengeAnswers": [{
    "type": "OTP",
    "value": "<otp_code>",
    "encryptedValue": "<same encryptedValue from step 2>"
  }]
}
```

Response (success):

```json
{ "challenge": "", "pendingChallenges": [] }
```

### 5. Trust Device (optional)

```http
POST /CreateTwoFactorAuthenticationForUser.v1
Host: functions.americanexpress.com
Content-Type: application/json; charset=UTF-8
one-data-correlation-id: <uuid>
```

Body is an **array**:

```json
[{ "locale": "it-IT", "trust": true, "deviceName": "My Device" }]
```

> **Status:** Not working from Python. The server requires the `agt` field in the `aat` JWT, which is only populated in browser sessions with full Akamai context. Returns `IDENT01` error from programmatic clients. Non-blocking — login works without it, but MFA is required every time.

### 6. Finalize Login

Second login POST with only `mfaId` (no credentials):

```http
POST /myca/logon/emea/action/login
Host: global.americanexpress.com
Content-Type: application/x-www-form-urlencoded; charset=utf-8
one-data-correlation-id: <uuid>
```

```
request_type=login&Face=it_IT&Logon=Logon&version=4
&mfaId=<from step 1>
&b_hour=<HH>&b_minute=<MM>&b_second=<SS>
&b_dayNumber=<DD>&b_month=<MM>&b_year=<YYYY>&b_timeZone=<offset>
```

Response: `{"statusCode": 0}` = session active.

---

## PUSH Notification Flow (alternative to OTP)

If `ReadAuthenticationChallenges` returns `PUSH_NOTIFICATION`:

### Send Push

```http
POST /CreatePushNotificationDelivery.v1
Host: functions.americanexpress.com
```

```json
{
  "userJourneyIdentifier": "aexp.global:create:session",
  "pushDeliveryRequest": {
    "deliveryMethod": "PUSH",
    "encryptedValue": "<from challenge>",
    "installationId": "<from challenge deviceDetails>"
  }
}
```

Response includes `messageTrackingId`.

### Poll Push Status

```http
POST /ReadPushNotificationDeliveryStatus.v1
Host: functions.americanexpress.com
```

```json
{
  "userJourneyIdentifier": "aexp.global:create:session",
  "messageTrackingId": "<from push response>",
  "encryptedValue": "<original>",
  "installationId": "<original>",
  "assessmentToken": "<from login>"
}
```

HTTP status: `200` = accepted, `406` = declined, other = pending.

---

## Transactions API

After successful login:

```http
GET /api/servicing/v1/financials/transactions?limit=1000&status=posted&extended_details=merchant,category
Host: global.americanexpress.com
Accept: application/json
account_token: <account_token>
correlation_id: MYCA-<uuid>
Referer: https://global.americanexpress.com/activity/recent
```

`status` can be `posted` or `pending`. The `account_token` is a fixed value per card account.

Response:

```json
{
  "total_count": 21,
  "transactions": [{
    "identifier": "AT<account>---<seq>---<YYYYMMDD>",
    "description": "<MERCHANT>               <CITY>",
    "amount": 0.00,
    "type": "DEBIT",
    "charge_date": "YYYY-MM-DD",
    "post_date": "YYYY-MM-DD",
    "extended_details": {
      "merchant": { "name": "<MERCHANT>" }
    }
  }]
}
```

- `type`: `DEBIT` (expense) or `CREDIT` (refund/payment)
- `amount`: always positive — sign determined by `type`
- `identifier`: unique, usable as `imported_id` for deduplication

### Other Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/servicing/v1/financials/statement_periods` | Billing periods |
| `/api/servicing/v1/financials/balances` | Account balances |
| `/api/servicing/v1/financials/transaction_summary` | Summary |

All require `account_token` header.

---

## Session Management

```http
POST /ReadUserSession.v1
Host: functions.americanexpress.com
Body: {}
```

Returns `{tokenExpiry, sessionExpiry, tokenStatus}`.

```http
POST /UpdateUserSession.v1
Host: functions.americanexpress.com
Body: {}
```

Extends the `aat` token (renews the 5-minute TTL).

---

## Common Errors

| Code | Error | Cause |
|------|-------|-------|
| `LGON013` (200, statusCode:1) | MFA required | Normal — proceed with MFA flow |
| `UE_MISSING_CHALLENGE_ANSWERS` (423) | Wrong OTP format | Use `challengeAnswers` array, not `oneTimePasscode` |
| `UE_INVALID_DELIVERY_METHOD` (400) | Bad delivery method | Use `EMAIL`/`SMS` for OTP, `PUSH` for push |
| `UE_ADDITIONAL_PROPERTIES_PROVIDED` (400) | Extra fields in body | Server is strict — no extra fields |
| `access_denied` (401) | Session expired | `aat` expired (5 min TTL) or MFA not completed |
| `code:110` (400) | Missing account token | Add `account_token` header to transaction requests |

## Notes

- The `aat` cookie (JWT, HTTP-only) is the sole authentication mechanism. It expires in ~5 minutes but can be renewed via `UpdateUserSession.v1`.
- Anti-bot systems (Akamai Bot Manager, InAuth, Dynatrace) are present but do not block programmatic login or OTP flows.