"""
Sends real email when SMTP_* env vars are set (works with any SMTP
provider: Gmail app password, SendGrid/Mailgun/SES SMTP relay, etc).
If they aren't set, falls back to printing the message to the
server log — so password reset still works end-to-end locally
without needing an email account configured.

Required env vars for real sending:
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
"""
import os
import smtplib
import ssl
from email.message import EmailMessage

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", "no-reply@kalviahealth.example")


def send_email(to_address: str, subject: str, body: str) -> None:
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        # Dev fallback: no SMTP configured, just log it so the flow
        # is still testable end-to-end.
        print(f"[email:not-configured] to={to_address} subject={subject!r} body={body!r}")
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_address
    msg.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls(context=context)
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
