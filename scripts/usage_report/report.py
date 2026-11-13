"""Weekly Supabase usage report for MoveMaxx, emailed by .github/workflows/usage-report.yml.

Reads the numbers from the `admin_usage_report()` database function (service role only),
compares them with the Supabase Free plan limits, and emails an HTML report through the
same Gmail SMTP sender the app's sign-in codes use. Stdlib only.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_ADDRESS (optional), GMAIL_APP_PASSWORD,
REPORT_TO (optional, defaults to GMAIL_ADDRESS). DRY_RUN=1 prints instead of sending.
"""
import html as html_lib
import json
import os
import smtplib
import ssl
import sys
import urllib.request
from email.message import EmailMessage

# Supabase Free plan limits (check supabase.com/pricing if they change).
FREE_LIMITS = {
    "db_bytes": 500 * 1000 * 1000,
    "storage_bytes": 1000 * 1000 * 1000,
    "active_30d": 50_000,
}
LABELS = {"db_bytes": "Database", "storage_bytes": "File storage", "active_30d": "Monthly active users"}
RANK = {"ok": 0, "watch": 1, "upgrade soon": 2}
COLORS = {"ok": "#1a7f37", "watch": "#9a6700", "upgrade soon": "#cf222e"}


def status_for(fraction: float) -> str:
    if fraction >= 0.8:
        return "upgrade soon"
    if fraction >= 0.5:
        return "watch"
    return "ok"


def fmt_bytes(n: float) -> str:
    n = float(n or 0)
    for unit in ("B", "kB", "MB", "GB"):
        if n < 1000 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000
    return f"{n:.1f} GB"


def fmt_value(key: str, v: float) -> str:
    return fmt_bytes(v) if key.endswith("bytes") else f"{int(v or 0):,}"


def build_report(d: dict) -> tuple[str, str, str]:
    rows = []
    for key, limit in FREE_LIMITS.items():
        used = d.get(key) or 0
        frac = used / limit
        rows.append((LABELS[key], fmt_value(key, used), fmt_value(key, limit), f"{frac * 100:.1f}%", status_for(frac)))
    worst = max(rows, key=lambda r: RANK[r[4]])
    if worst[4] == "ok":
        subject = "MoveMaxx Supabase weekly report: all clear"
    else:
        subject = f"MoveMaxx Supabase weekly report: {worst[4]} ({worst[0]} at {worst[3]})"

    activity = [
        ("Users (total / new this week)", f"{d.get('users_total', 0):,} / {d.get('users_new_7d', 0):,}"),
        ("Signed in (7 days / 30 days)", f"{d.get('active_7d', 0):,} / {d.get('active_30d', 0):,}"),
        ("Workouts / sets logged this week", f"{d.get('workouts_7d', 0):,} / {d.get('sets_7d', 0):,}"),
        ("Active sprints", f"{d.get('active_sprints', 0):,}"),
        ("AI coach calls this week", f"{d.get('coach_calls_7d', 0):,}"),
        ("Stored files", f"{d.get('storage_files', 0):,}"),
    ]
    tables = [(t.get("name", "?"), fmt_bytes(t.get("bytes", 0))) for t in (d.get("largest_tables") or [])]
    advice = (
        "Nothing to do: everything is well under the Free plan."
        if worst[4] == "ok"
        else f"{worst[0]} is at {worst[3]} of the Free plan. Plan the move to Pro ($25/month) before it reaches 100%."
    )
    note = "Bandwidth (5 GB/month on Free) isn't visible from the database; check Organization → Usage in the Supabase dashboard."

    text = "\n".join(
        [subject, "", "Free plan limits:"]
        + [f"  {r[0]}: {r[1]} of {r[2]} ({r[3]}, {r[4]})" for r in rows]
        + ["", "This week:"]
        + [f"  {k}: {v}" for k, v in activity]
        + ["", "Largest tables:"]
        + [f"  {n}: {s}" for n, s in tables]
        + ["", advice, note]
    )

    e = html_lib.escape
    limit_rows = "".join(
        f"<tr><td>{e(r[0])}</td><td>{e(r[1])}</td><td>{e(r[2])}</td><td>{e(r[3])}</td>"
        f"<td style='color:{COLORS[r[4]]};font-weight:600'>{e(r[4])}</td></tr>"
        for r in rows
    )
    act_rows = "".join(f"<tr><td>{e(k)}</td><td>{e(v)}</td></tr>" for k, v in activity)
    tbl_rows = "".join(f"<tr><td>{e(n)}</td><td>{e(s)}</td></tr>" for n, s in tables)
    style = "border-collapse:collapse;margin:8px 0 20px"
    cell = "<style>td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}</style>"
    html = f"""<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
{cell}<h2 style="margin:0 0 4px">MoveMaxx: Supabase weekly report</h2>
<p style="margin:0 0 16px">{e(advice)}</p>
<h3>Free plan limits</h3>
<table style="{style}"><tr><th>Limit</th><th>Used</th><th>Free plan</th><th>%</th><th>Status</th></tr>{limit_rows}</table>
<h3>This week</h3><table style="{style}">{act_rows}</table>
<h3>Largest tables</h3><table style="{style}">{tbl_rows}</table>
<p style="color:#666;font-size:13px">{e(note)}</p></div>"""
    return subject, html, text


def fetch_numbers() -> dict:
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/admin_usage_report"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        url, data=b"{}", method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def send(subject: str, html: str, text: str) -> None:
    sender = os.environ.get("GMAIL_ADDRESS") or "smadimsetty@gmail.com"
    to = os.environ.get("REPORT_TO") or sender
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, f"MoveMaxx <{sender}>", to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    pw = os.environ["GMAIL_APP_PASSWORD"].replace(" ", "")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context()) as s:
        s.login(sender, pw)
        s.send_message(msg)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    subject, html, text = build_report(fetch_numbers())
    if os.environ.get("DRY_RUN") == "1":
        print(text)
        return 0
    send(subject, html, text)
    print(f"sent: {subject}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
