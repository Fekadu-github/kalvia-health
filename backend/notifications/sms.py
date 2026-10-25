"""
Placeholder SMS sender. There is no free/built-in way to send real
SMS — every provider (Twilio, Vonage, Africa's Talking, etc.)
requires you to create an account and get API credentials, which
only you can set up.

Until that's wired in, this just logs the message so the reset
flow works end-to-end for accounts that used a phone number (the
code will be visible in Render's server logs instead of arriving
by text).

To go live with real SMS:
1. Create an account with a provider (Africa's Talking is commonly
   used for Ethiopian numbers; Twilio is the most common globally).
2. Set env vars for its API key/credentials on Render.
3. Replace the body of send_sms() below with that provider's API
   call — every provider's Python SDK follows roughly the same
   pattern (send-message call with to/from/body).
"""


def send_sms(to_number: str, body: str) -> None:
    print(f"[sms:not-configured] to={to_number} body={body!r}")
