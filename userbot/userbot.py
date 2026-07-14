"""
True Match — CardXabar userbot.

Runs on a machine that stays online 24/7 — your own VPS/PC, or a SEPARATE
Railway account (NOT the account your app runs on; Railway's fair-use policy
bans userbots, so keep it isolated from your production app + database).

It logs into your Telegram account as an extra session, listens to the
CardXabar bot's incoming-payment notifications, extracts the exact amount, and
forwards it to the True Match backend webhook. The backend matches the amount
(unique tiyin suffix) to a pending order and activates Premium/Boost/Gift
automatically.

Your phone/laptop do NOT need to be online — this session stays connected on
its own.

Auth: set TG_SESSION_STRING (recommended for servers — generate it once, see
README) or use a local file session on first run.

IMPORTANT — receiving updates reliably:
  * The same session must NOT be logged in and connected in two places at once
    (e.g. a Colab notebook left running). Telegram will route updates to only
    one connection, and this bot will appear to receive nothing. Make sure any
    generator session (Colab) is fully stopped.
  * We call get_dialogs() on startup so the client's entity cache is warm, then
    listen to ALL new messages and filter by sender ourselves. This is more
    reliable on a fresh string-session than a chats=[...] event filter, which
    may not match before the dialog list is loaded.

See README.md for full setup instructions.
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


# ----- Configuration (from .env / environment) -----
API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_NAME = os.getenv("TG_SESSION", "cardxabar_userbot")
SESSION_STRING = os.getenv("TG_SESSION_STRING", "").strip()

# Username(s) or numeric id(s) of the CardXabar bot/chat that delivers the
# notifications. Comma-separated to allow more than one source.
CARDXABAR_SOURCE = os.getenv("CARDXABAR_SOURCE", "").strip()

BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
PAYMENT_SECRET = os.getenv("PAYMENT_SECRET", "")

# Optional: only react to notifications mentioning this card's last 4 digits.
CARD_LAST4 = os.getenv("CARD_LAST4", "").strip()

WEBHOOK_PATH = "/api/payments/cardxabar"


def _sources():
    """Split CARDXABAR_SOURCE into a set of usernames (lower) and numeric ids."""
    names, ids = set(), set()
    for part in CARDXABAR_SOURCE.split(","):
        p = part.strip().lstrip("@")
        if not p:
            continue
        if p.lstrip("-").isdigit():
            ids.add(int(p))
        else:
            names.add(p.lower())
    return names, ids


ALLOWED_NAMES, ALLOWED_IDS = _sources()

# Match a credit line. Accept the heavy plus ➕ (U+2795), fullwidth ＋ and ASCII +.
_PLUS = re.compile(r"[\u2795\uFF0B+]")
# A number possibly using space / non-breaking-space thousands separators and
# '.' or ',' as the decimal separator.
_NUMBER = re.compile(r"[0-9][0-9\s\u00a0.,]*[0-9]|[0-9]")


def parse_amount_to_tiyin(text):
    """
    Extract the credited amount (the line containing a '+') and return it in
    tiyin (1 UZS = 100 tiyin), or None. Handles space/nbsp thousands separators
    and either '.' or ',' as the decimal separator.
    """
    credit_line = None
    for line in text.splitlines():
        if _PLUS.search(line) and any(c.isdigit() for c in line):
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


def _post_webhook(tiyin, raw):
    """Synchronous POST to the backend (run off the event loop via to_thread)."""
    resp = requests.post(
        f"{BACKEND_URL}{WEBHOOK_PATH}",
        json={"amountTiyin": tiyin, "raw": raw},
        headers={
            "X-Payment-Secret": PAYMENT_SECRET,
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    return resp.status_code, resp.text


async def notify_backend(tiyin, raw):
    try:
        status, text = await asyncio.to_thread(_post_webhook, tiyin, raw)
    except Exception as exc:  # network error, DNS, timeout...
        print(f"[userbot] webhook error: {exc}")
        return
    if status == 200 and '"matched":true' in text.replace(" ", ""):
        print(f"[userbot] matched & activated: {tiyin} tiyin")
    elif status == 200:
        print(f"[userbot] no matching order for {tiyin} tiyin (ignored)")
    else:
        print(f"[userbot] webhook returned {status}: {text}")


async def _is_allowed(event):
    """True if the message came from an allowed CardXabar source."""
    if not ALLOWED_NAMES and not ALLOWED_IDS:
        return True  # no filter configured → accept all (not recommended)
    try:
        sender = await event.get_sender()
    except Exception:
        sender = None
    uname = (getattr(sender, "username", None) or "").lower()
    sid = getattr(sender, "id", None)
    return (
        uname in ALLOWED_NAMES
        or sid in ALLOWED_IDS
        or event.chat_id in ALLOWED_IDS
    )


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
            "[userbot] Missing required env values: " + ", ".join(missing)
        )


async def main():
    _validate_config()
    client = _build_client()

    # Interactive login on first run (file session); a string session connects
    # non-interactively.
    await client.start()
    me = await client.get_me()
    who = f"@{me.username}" if me.username else str(me.id)
    print(f"[userbot] logged in as {who}")

    # Warm the entity cache so incoming messages are recognised reliably.
    try:
        await client.get_dialogs()
        print("[userbot] chat list loaded")
    except Exception as exc:
        print(f"[userbot] get_dialogs warning: {exc}")

    @client.on(events.NewMessage())
    async def handler(event):
        # Only react to the configured CardXabar source.
        if not await _is_allowed(event):
            return
        text = event.raw_text or ""
        # Only credits (a '+' line). Optional last-4 card filter.
        if not _PLUS.search(text):
            return
        if CARD_LAST4 and CARD_LAST4 not in text:
            return
        tiyin = parse_amount_to_tiyin(text)
        if not tiyin:
            print("[userbot] could not parse a credit amount; skipping")
            return
        print(f"[userbot] incoming credit: {tiyin} tiyin")
        await notify_backend(tiyin, text)

    print(f"[userbot] ready - locked to source: {CARDXABAR_SOURCE}")
    print("[userbot] waiting for CardXabar payment notifications...")
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
