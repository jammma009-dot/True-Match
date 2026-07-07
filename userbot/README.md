# True Match — CardXabar userbot

Automates **card-to-card payments** for True Match. When a customer transfers
the exact amount shown in the app to your card, the [CardXabar](https://t.me/CardXabar_bot)
bot notifies your Telegram, this userbot reads that notification and tells the
backend, which then activates **Premium / Boost / Gift automatically** — no
legal entity, no payment provider, no bank API required.

```
Customer pays exact amount ──► Bank ──► CardXabar bot (Telegram)
                                              │
                                              ▼
                                   userbot (this, on YOUR server)
                                              │  POST /api/payments/cardxabar
                                              ▼
                                   True Match backend ──► activates entitlement
```

## ⚠️ Where to run it (not on your app's Railway account)

Railway's fair-use policy bans Telegram **userbots** (self-accounts), and a
violation can suspend the whole account. Since your backend + database live on
your main Railway account, do **not** run the userbot there.

Good places to run it:
- A **separate** Railway account (different login) — isolates the ban risk from
  your production app. This works well; deploy this folder as its own service
  and set the env vars below (use a `TG_SESSION_STRING` since Railway has no
  interactive terminal for the login code).
- Your own **VPS** (Hetzner, Contabo, Oracle Cloud Always Free) or a home PC/
  Raspberry Pi that stays on.

Only this userbot needs a separate home. The backend, bot and Mini App stay on
your main Railway/Vercel setup as before.

### Generating a session string (for headless hosts)

On a host with no interactive terminal (like Railway), generate the session
string once — locally or in a browser via **Google Colab**:

```python
!pip install -q telethon
from telethon import TelegramClient
from telethon.sessions import StringSession
api_id = int(input("api_id: ")); api_hash = input("api_hash: ")
client = TelegramClient(StringSession(), api_id, api_hash)
await client.start()          # asks for phone + login code
print(client.session.save())  # <-- copy this into TG_SESSION_STRING
```

> Then **fully stop** that generator session (in Colab: *Runtime → Disconnect
> and delete runtime*). If the same session stays connected in two places,
> Telegram routes updates to only one and the deployed bot will receive nothing.

## How payment matching works

Each order gets a **unique last-two-digits (tiyin) suffix**, e.g. the price is
`1000` so'm but the app asks the customer to send `1000.17`. That `.17`
identifies exactly which order/user paid — so the userbot only needs the amount,
never any bank requisites. Orders expire after 30 minutes.

## Prerequisites

1. **Python 3.10+**
2. **Telegram API credentials** — go to https://my.telegram.org → *API
   development tools* → create an app → copy `api_id` and `api_hash`.
3. Your Telegram account must **receive CardXabar notifications** (set CardXabar
   up with your card first, and make sure you get its messages).
4. In the True Match **admin panel** → *Settings → Card payment*, set:
   - **Card number** (and holder name)
   - **Premium / Present price (so'm)**
   - **Webhook secret** → click *Generate*, then *Save settings*. Copy this
     value; you'll paste it into `.env` below as `PAYMENT_SECRET`.

## Setup

```bash
cd userbot
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and fill in every value (see comments in the file)
```

### First run (one-time interactive login)

```bash
python userbot.py
```

You'll be prompted for:
- your **phone number** (the account that receives CardXabar messages),
- the **login code** Telegram sends you,
- your **2FA password** (if you have one enabled).

The session is saved to `cardxabar_userbot.session` so you're **never asked
again**. Your phone/laptop can be offline afterwards — this session stays
connected independently.

> Tip: use a **secondary phone number** for the account if you can, and never
> press "Terminate all other sessions" in Telegram settings (that would log this
> userbot out).

When it works you'll see:

```
[userbot] logged in as @yourname
[userbot] listening to: ['CardXabar_bot']
[userbot] ready — waiting for CardXabar payment notifications...
```

Send yourself a test transfer of the exact amount the app shows, and watch for:

```
[userbot] incoming credit detected: 100017 tiyin
[userbot] ✅ matched & activated: 100017 tiyin
```

## Run 24/7 with systemd (Linux VPS)

Create `/etc/systemd/system/cardxabar-userbot.service`:

```ini
[Unit]
Description=True Match CardXabar userbot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/truematch/userbot
ExecStart=/opt/truematch/userbot/.venv/bin/python /opt/truematch/userbot/userbot.py
Restart=always
RestartSec=5
User=youruser

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cardxabar-userbot
sudo journalctl -u cardxabar-userbot -f      # live logs
```

> Do the interactive first-run login **once** (so the `.session` file exists)
> before enabling the service, since systemd can't type the code for you.

## Configuration reference (`.env`)

| Variable            | Required | Description |
|---------------------|:--------:|-------------|
| `TG_API_ID`         | ✅ | From my.telegram.org |
| `TG_API_HASH`       | ✅ | From my.telegram.org |
| `TG_SESSION`        |   | File-session name (default `cardxabar_userbot`) |
| `TG_SESSION_STRING` |   | Use a StringSession instead of a file (optional) |
| `CARDXABAR_SOURCE`  | ✅ | CardXabar bot @username or id (comma-separate for several) |
| `BACKEND_URL`       | ✅ | Deployed backend base URL, no trailing slash |
| `PAYMENT_SECRET`    | ✅ | Must equal the admin-panel *Webhook secret* |
| `CARD_LAST4`        |   | Only react to messages mentioning this card's last 4 digits |

## Security notes

- The webhook is authenticated by `PAYMENT_SECRET` (sent as the
  `X-Payment-Secret` header). Keep it private; rotate it in the admin panel if
  leaked.
- The userbot only ever **reads** CardXabar messages and posts an amount — it
  never sends messages or touches your other chats.
- It reacts only to **credit** lines (the `➕` marker), so debits/other messages
  are ignored.

## Troubleshooting

- **No reaction to a payment:** confirm `CARDXABAR_SOURCE` matches the exact chat
  the notification arrives in; check the message actually contains a `➕` line.
- **`webhook returned 401`:** `PAYMENT_SECRET` doesn't match the admin panel.
- **`webhook returned 503`:** set/save the Webhook secret in the admin panel.
- **`no matching order`:** the amount didn't match any *pending* order (wrong
  amount, order expired after 30 min, or already paid). Ask the customer to
  start a fresh payment in the app and send the new exact amount.
