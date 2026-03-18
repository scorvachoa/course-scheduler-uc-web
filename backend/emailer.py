"""Email sending helpers (SMTP)."""
from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def send_contact_email(name: str, email: str, subject: str, message: str) -> None:
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASSWORD", "").strip()
    smtp_to = os.environ.get("SMTP_TO", smtp_user).strip()

    if not smtp_user or not smtp_pass or not smtp_to:
        raise RuntimeError("SMTP no configurado. Define SMTP_USER, SMTP_PASSWORD y SMTP_TO")

    msg = EmailMessage()
    msg["Subject"] = f"[Course Scheduler UC] {subject}"
    msg["From"] = smtp_user
    msg["To"] = smtp_to
    msg.set_content(
        "\n".join(
            [
                f"Nombre: {name}",
                f"Correo: {email}",
                "",
                message,
            ]
        )
    )

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
