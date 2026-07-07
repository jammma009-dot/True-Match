"""
True Match — CardXabar userbot.

Runs on YOUR OWN machine or VPS (NOT on Railway — Railway forbids Telegram
userbots). It logs into your Telegram account as an extra session, listens to
the CardXabar bot's incoming-payment notifications, extracts the exact amount,
and forwards it to the True Match backend webhook. The backend matches the
amount (unique tiyin suffix) to a pending order and activates Premium/Boost
automatically.

Your phone/laptop do NOT need to be online — this server session stays
connected on its own.

One-time setup: run `python userbot.py`, enter your phone number and the login
code Telegram sends you (and your 2FA password if enabled). The session is
saved to a local file so you're never asked again.

See README.md for full instructions (incl. running 24/7 with systemd).
"""

import asyncio
import os
import re
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

import requests
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession

load_dotenv()


# ----- Configuration (from .env) -----
API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_NAME = os.getenv("TG_SESSION", "cardxabar_userbot")
SESSION_STRING = os.getenv("TG_SESSION_STRING", "").strip()

# Username or numeric id of the CardXabar bot/chat that delivers the
# notifications. Comma-separated to listen to more than one source.
CARDXABAR_SOURCE = os.getenv("CARDXABAR_SOURCE", "").strip()

BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
PAYMENT_SECRET = os.getenv("PAYMENT_SECRET", "")

# Optional: only react to notifications for a specific card (last 4 digits).
CARD_LAST4 = os.getenv("CARD_LAST4", "").strip()

WEBHOOK_PATH = "/api/payments/cardxabar"


def _sources():
    """Parse CARDXABAR_SOURCE into a list of usernames / numeric ids."""
    out = []
    for part in CARDXABAR_SOURCE.split(","):
        p = part.strip().lstrip("@")
        if not p:
            continue
        out.append(int(p) if p.lstrip("-").isdigit() else p)
    return out


# Matches the credited-amount line, e.g. "➕ 1 000.17 UZS".
_CREDIT_LINE = re.compile(r"\u2795")  # ➕
_NUMBER = re.compile(r"[0-9][0-9\s.,]*[0-9]|[0-9]")


def parse_amount_to_tiyin(text: str):
    """
    Extract the credited amount (the ➕ line) and return it in tiyin
    (1 UZS = 100 tiyin), or None if not found. Handles space thousands
    separators and either '.' or ',' as the decimal separator.
    """
    credit_line = None
    for line in text.splitlines():
        if _CREDIT_LINE.search(line):
            credit_line = line
            break
    if credit_line is None:
        return None

    m = _NUMBER.search(credit_line)
    if not m:
        return None

    token = m.group(0).replace(" ", "").replace("\u00a0", "")
    if "," in token and "." in token:
        # e.g. "1,000.17" — comma is a thousands separator.
        token = token.replace(",", "")
    elif "," in token:
        # e.g. "1000,17" — comma is the decimal separator.
        token = token.replace(",", ".")

    try:
        value = Decimal(token)
    except InvalidOperation:
        return None

    tiyin = int((value * 100).to_integral_value(rounding=ROUND_HALF_UP))
    return tiyin if tiyin > 0 else None


def _post_webhook(tiyin: int, raw: str):
    """Synchronous POST to the backend (run off the event loop via to_thread)."""
    url = f"{BACKEND_URL}{WEBHOOK_PATH}"
    resp = requests.post(
        url,
        json={"amountTiyin": tiyin, "raw": raw},
        headers={
            "X-Payment-Secret": PAYMENT_SECRET,
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    return resp.status_code, resp.text


async def notify_backend(tiyin: int, raw: str):
    try:
        status, text = await asyncio.to_thread(_post_webhook, tiyin, raw)
    except Exception as exc:  # network error, DNS, timeout...
        print(f"[userbot] webhook error: {exc}")
        return
    if status == 200 and '"matched":true' in text.replace(" ", ""):
        print(f"[userbot] ✅ matched & activated: {tiyin} tiyin")
    elif status == 200:
        print(f"[userbot] no matching order for {tiyin} tiyin (ignored)")
    else:
        print(f"[userbot] webhook returned {status}: {text}")


def _build_client() -> TelegramClient:
    if SESSION_STRING:
        return TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)
    return TelegramClient(SESSION_NAME, API_ID, API_HASH)


def _validate_config():
    missing = []
    if not API_ID:
        missing.append("TG_API_ID")
    if not API_HASH:
        missing.append("TG_API_HASH")
    if not CARDXABAR_SOURCE:
        missing.append("CARDXABAR_SOURCE")
    if not BACKEND_URL:
        missing.append("BACKEND_URL")
    if not PAYMENT_SECRET:
        missing.append("PAYMENT_SECRET")
    if missing:
        raise SystemExit(
            "[userbot] Missing required .env values: " + ", ".join(missing)
        )


async def main():
    _validate_config()
    client = _build_client()

    sources = _sources()

    @client.on(events.NewMessage(chats=sources))
    async def handler(event):
        text = event.raw_text or ""
        # Only react to CREDITS (the ➕ line). Debits/other messages are ignored.
        if "\u2795" not in text:
            return
        # Optional last-4 card filter.
        if CARD_LAST4 and CARD_LAST4 not in text:
            return
        tiyin = parse_amount_to_tiyin(text)
        if not tiyin:
            print("[userbot] could not parse amount from message; skipping")
            return
        print(f"[userbot] incoming credit detected: {tiyin} tiyin")
        await notify_backend(tiyin, text)

    # Interactive login on first run; reuses the saved session afterwards.
    await client.start()
    me = await client.get_me()
    who = f"@{me.username}" if me.username else str(me.id)
    print(f"[userbot] logged in as {who}")
    print(f"[userbot] listening to: {sources}")
    print("[userbot] ready — waiting for CardXabar payment notifications...")
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
