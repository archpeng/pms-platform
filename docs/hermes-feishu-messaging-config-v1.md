# Hermes Feishu Messaging Config v1

This is the S5 execution note and blocker route for enabling controlled Hermes Feishu messaging. No secrets are committed here.

## Current status

Local config discovery found Feishu app credentials in `adapter-feishu/.env`. Per operator instruction, the verified local test chat target from `warning-core/.env` (`WARNING_CORE_ADAPTER_FEISHU_CHAT_ID`) was copied into the gitignored local adapter env key `ADAPTER_FEISHU_SMOKE_CHAT_ID` without printing or committing the value.

Local smoke results:

1. `adapter-feishu` provider webhook smoke delivered to Feishu with `body.code = 0` and `status = delivered`.
2. Hermes Feishu env keys were configured in `~/.hermes/.env` from the local adapter env, with values redacted from logs.
3. `hermes gateway restart` connected to Feishu/Lark websocket successfully.

Remaining S5 blocker is now operator authorization / inbound proof, not app credentials: Hermes reported no user allowlists configured, so unauthorized users will be denied. To preserve the safety rule against broad remote access, S5 should not set `GATEWAY_ALLOW_ALL_USERS=true`; it needs a concrete `FEISHU_ALLOWED_USERS` / equivalent allowlist value or an explicit manual sandbox inbound test from an allowed user.

## Local secret/config checklist

Required outside git, with discovered local paths:

1. Feishu/Lark app id — `adapter-feishu/.env`: `FEISHU_APP_ID`.
2. Feishu/Lark app secret — `adapter-feishu/.env`: `FEISHU_APP_SECRET`.
3. Verification token / encrypt key — `adapter-feishu/.env`: `FEISHU_WEBHOOK_VERIFICATION_TOKEN`, `FEISHU_ENCRYPT_KEY`; `FEISHU_WEBHOOK_SECRET` is present but empty.
4. Bot/user permissions and sandbox target — `adapter-feishu/.env`: `ADAPTER_FEISHU_SMOKE_CHAT_ID` is now locally configured from `warning-core/.env` `WARNING_CORE_ADAPTER_FEISHU_CHAT_ID`; `ADAPTER_FEISHU_SMOKE_OPEN_ID` remains empty.
5. Hermes local gateway endpoint/config — `~/.hermes/.env` now has Feishu app credentials, verification token, encrypt key, domain, and home channel copied from local adapter config; `hermes gateway restart` connected to Feishu/Lark websocket.
6. Adapter runtime config — `adapter-feishu/.env` is gitignored and was used for the successful provider webhook smoke; systemd service `~/.config/systemd/user/feishu-adapter.service` points to an older `boston-bot-vp` adapter path and is not the active smoke path used here.
7. Operator allowlist values — not found as an explicit PMS/Hermes allowlist in the searched files. This remains the safe blocker before remote mutating PMS commands.

## Operator allowlist rule

Before mutating PMS commands are reachable through Feishu, Hermes must enforce an allowlist:

- only explicitly configured sandbox users/chats can invoke PMS tools;
- unauthorized users receive a denial response;
- all accepted tool requests must carry actor, source, reason, correlationId, idempotencyKey, requestedAt, and requestFingerprint;
- mutating PMS execution still requires later card confirmation and typed `mode: 'confirm'`.

## Failure modes to test once credentials exist

1. Feishu platform disabled or app not installed.
2. Missing app secret / invalid secret.
3. Unauthorized user/chat.
4. Hermes gateway down.
5. PMS tool unavailable.
6. Feishu API rate limit or send-message failure.

## No-secret rule

Do not commit real credentials, tenant ids if sensitive, webhook URLs with secrets, or local operator allowlist values that should remain private.

## Next action after credentials exist

Run a Feishu sandbox smoke proving Hermes can receive and respond remotely, without enabling mutating PMS commands from Feishu before card confirmation.
