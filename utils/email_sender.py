from html import escape

import socket
import threading

from flask import current_app, has_app_context
from flask_mail import Message

from extensions import mail


BRAND_NAME = "TaskMaster"
SIGNATURE = "Zespol TaskMaster"
DEFAULT_MAIL_TIMEOUT_SECONDS = 10


_pool_lock = threading.Lock()
_email_executor = None


def _get_executor():
    """Lazy-init shared thread pool used to send emails off the request thread."""
    global _email_executor
    if _email_executor is not None:
        return _email_executor
    with _pool_lock:
        if _email_executor is None:
            from concurrent.futures import ThreadPoolExecutor
            _email_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="email")
    return _email_executor


def missing_mail_config():
    if current_app.config.get("MAIL_SUPPRESS_SEND"):
        return []

    missing = []
    if not current_app.config.get("MAIL_SERVER"):
        missing.append("MAIL_SERVER")
    if not (current_app.config.get("MAIL_DEFAULT_SENDER") or current_app.config.get("MAIL_USERNAME")):
        missing.append("MAIL_DEFAULT_SENDER")
    return missing


def send_email(to_email, subject, body):
    """Synchronous email send. Returns True on success.

    Use enqueue_email() from request handlers - this call blocks the
    current thread on SMTP and is only safe in background workers/tests.
    """
    missing = missing_mail_config()
    if missing:
        current_app.logger.warning(
            "Email not sent to %s: missing mail configuration: %s",
            to_email,
            ", ".join(missing),
        )
        return False

    if current_app.config.get("MAIL_SUPPRESS_SEND"):
        current_app.logger.info(
            "Email to %s suppressed (MAIL_SUPPRESS_SEND=True): %s",
            to_email,
            subject,
        )
        # Flask-Mail honours MAIL_SUPPRESS_SEND and skips the SMTP roundtrip,
        # but tests still rely on mail.send being called for inspection.

    sender = current_app.config.get("MAIL_DEFAULT_SENDER") or current_app.config.get("MAIL_USERNAME")
    msg = Message(subject, recipients=[to_email], sender=sender)

    if isinstance(body, dict):
        msg.body = body.get("text", "")
        msg.html = body.get("html")
    else:
        msg.body = str(body)

    timeout = current_app.config.get("MAIL_TIMEOUT", DEFAULT_MAIL_TIMEOUT_SECONDS)
    previous_timeout = socket.getdefaulttimeout()
    if timeout:
        socket.setdefaulttimeout(timeout)
    try:
        mail.send(msg)
        current_app.logger.info("Email sent to %s with subject: %s", to_email, subject)
        return True
    except Exception as e:
        current_app.logger.error("Failed to send email to %s: %s", to_email, e)
        return False
    finally:
        if timeout:
            socket.setdefaulttimeout(previous_timeout)


def enqueue_email(to_email, subject, body):
    """Schedule an email to be sent off the request thread.

    Returns immediately so HTTP handlers don't wait on SMTP. If the app is
    configured to send emails synchronously (e.g. tests, or MAIL_ASYNC=False)
    the call falls back to send_email and propagates its return value.
    """
    if not has_app_context():
        # Fallback: nothing useful we can do without an app context.
        return False

    if not current_app.config.get("MAIL_ASYNC", True):
        return send_email(to_email, subject, body)

    app = current_app._get_current_object()

    def _worker():
        with app.app_context():
            try:
                send_email(to_email, subject, body)
            except Exception:  # noqa: BLE001 - log and swallow, never crash the worker
                app.logger.exception("Async email worker crashed for %s", to_email)

    _get_executor().submit(_worker)
    return True


def _line(label, value):
    if value is None or value == "":
        return None
    return (label, str(value))


def _plain_text(greeting, intro, details, cta_label, cta_url, footer_note=None):
    lines = [
        greeting,
        "",
        intro,
        "",
    ]

    for item in details:
        if not item:
            continue
        label, value = item
        lines.append(f"{label}: {value}")

    lines.extend([
        "",
        f"{cta_label}: {cta_url}",
        "",
    ])

    if footer_note:
        lines.extend([footer_note, ""])

    lines.append(SIGNATURE)
    return "\n".join(lines)


def _detail_rows(details):
    rows = []
    for item in details:
        if not item:
            continue
        label, value = item
        rows.append(
            f"""
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:13px;width:36%;">{escape(label)}</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:14px;font-weight:700;">{escape(str(value))}</td>
            </tr>
            """
        )
    return "\n".join(rows)


def _email_html(eyebrow, title, greeting, intro, details, cta_label, cta_url, tone="blue", footer_note=None):
    palette = {
        "blue": ("#2563eb", "#eff6ff", "#1d4ed8"),
        "green": ("#16a34a", "#f0fdf4", "#15803d"),
        "amber": ("#d97706", "#fffbeb", "#b45309"),
        "purple": ("#7c3aed", "#f5f3ff", "#6d28d9"),
        "slate": ("#334155", "#f8fafc", "#1e293b"),
    }
    accent, soft, cta = palette.get(tone, palette["blue"])
    safe_cta_url = escape(cta_url or "#", quote=True)
    rows = _detail_rows(details)
    footer = (
        f'<p style="margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.6;">{escape(footer_note)}</p>'
        if footer_note
        else ""
    )

    return f"""<!doctype html>
<html lang="pl">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 48px rgba(15,23,42,0.10);">
            <tr>
              <td style="height:7px;background:{accent};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 30px 18px;">
                <div style="display:inline-block;margin:0 0 18px;padding:7px 11px;border-radius:999px;background:{soft};color:{accent};font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">{escape(eyebrow)}</div>
                <h1 style="margin:0 0 14px;color:#0f172a;font-size:25px;line-height:1.2;">{escape(title)}</h1>
                <p style="margin:0 0 10px;color:#334155;font-size:16px;line-height:1.6;">{escape(greeting)}</p>
                <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">{escape(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 6px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:4px 18px;">
                  {rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px 30px;">
                <a href="{safe_cta_url}" style="display:inline-block;background:{cta};color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 18px;font-size:14px;font-weight:800;">{escape(cta_label)}</a>
                {footer}
                <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">To automatyczna wiadomosc z aplikacji {BRAND_NAME}.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">{escape(SIGNATURE)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _email_content(eyebrow, title, greeting, intro, details, cta_label, cta_url, tone="blue", footer_note=None):
    return {
        "text": _plain_text(greeting, intro, details, cta_label, cta_url, footer_note),
        "html": _email_html(eyebrow, title, greeting, intro, details, cta_label, cta_url, tone, footer_note),
    }


def get_task_status_change_body(task_title, old_status, new_status, task_link):
    return _email_content(
        eyebrow="Zmiana statusu",
        title="Status zadania zostal zmieniony",
        greeting="Czesc,",
        intro="W zadaniu pojawila sie zmiana statusu. Zerknij, jesli ten temat jest po Twojej stronie.",
        details=[
            _line("Zadanie", task_title),
            _line("Poprzedni status", old_status),
            _line("Nowy status", new_status),
        ],
        cta_label="Otworz zadanie",
        cta_url=task_link,
        tone="blue",
    )


def get_task_assignment_body(task_title, assignee_username, task_link):
    return _email_content(
        eyebrow="Nowe przypisanie",
        title="Masz nowe zadanie",
        greeting=f"Czesc {assignee_username},",
        intro="Zostales przypisany jako wykonawca. Zadanie jest gotowe do przejrzenia w aplikacji.",
        details=[
            _line("Zadanie", task_title),
            _line("Rola", "Wykonawca zadania"),
        ],
        cta_label="Przejdz do zadania",
        cta_url=task_link,
        tone="purple",
        footer_note="Zadanie moze miec tylko jednego wykonawce, wiec to przypisanie oznacza jasna odpowiedzialnosc za temat.",
    )


def get_task_completion_body(task_title, recipient_username, actor_username, completed, task_link):
    action = "zakonczone" if completed else "przywrocone"
    title = "Zadanie zostalo zakonczone" if completed else "Zadanie wrocilo do pracy"
    intro = (
        "Zadanie zostalo oznaczone jako wykonane. Dobra robota, temat jest domkniety."
        if completed
        else "Zadanie zostalo przywrocone i ponownie wymaga uwagi."
    )
    return _email_content(
        eyebrow="Aktualizacja zadania",
        title=title,
        greeting=f"Czesc {recipient_username},",
        intro=intro,
        details=[
            _line("Zadanie", task_title),
            _line("Akcja", action),
            _line("Wykonal(a)", actor_username),
        ],
        cta_label="Sprawdz zadanie",
        cta_url=task_link,
        tone="green" if completed else "amber",
    )


def get_project_completed_body(project_name, recipient_username, actor_username, project_link):
    return _email_content(
        eyebrow="Projekt zakonczony",
        title="Projekt zostal domkniety",
        greeting=f"Czesc {recipient_username},",
        intro="Projekt przeszedl checklisty gotowosci i zostal oznaczony jako zakonczony.",
        details=[
            _line("Projekt", project_name),
            _line("Zakonczyl(a)", actor_username),
        ],
        cta_label="Otworz projekt",
        cta_url=project_link,
        tone="green",
        footer_note="Jesli chcesz wrocic do szczegolow, projekt pozostaje dostepny w widoku projektow jako zakonczony.",
    )


def get_project_activity_body(project_name, recipient_username, actor_username, activity, project_link, task_title=None):
    return _email_content(
        eyebrow="Zmiana w projekcie",
        title="W projekcie pojawila sie aktualizacja",
        greeting=f"Czesc {recipient_username},",
        intro="W projekcie, w ktorym uczestniczysz, odnotowano nowa aktywnosc.",
        details=[
            _line("Projekt", project_name),
            _line("Aktywnosc", activity),
            _line("Zadanie", task_title),
            _line("Wykonal(a)", actor_username),
        ],
        cta_label="Przejdz do projektu",
        cta_url=project_link,
        tone="blue",
    )


def get_deadline_warning_body(task_title, due_date, task_link):
    return _email_content(
        eyebrow="Termin blisko",
        title="Zbliza sie termin zadania",
        greeting="Czesc,",
        intro="To krotkie przypomnienie, ze zadanie ma termin w najblizszym czasie.",
        details=[
            _line("Zadanie", task_title),
            _line("Termin", due_date),
        ],
        cta_label="Otworz zadanie",
        cta_url=task_link,
        tone="amber",
        footer_note="Jesli zadanie jest juz gotowe, oznacz je jako zakonczone w aplikacji.",
    )
