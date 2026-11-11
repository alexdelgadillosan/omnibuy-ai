import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import create_engine, text
from app.core.config import get_settings

engine = create_engine(get_settings().omnibuy_database_url, connect_args={"check_same_thread": False} if get_settings().omnibuy_database_url.startswith("sqlite") else {})

DEFAULT_POLICY: dict = {
    "budget_cap": 900.0,
    "monthly_cap": 5000.0,
    "max_item_price": 600.0,
    "currency": "USD",
    "allowed_merchants": [],
    "restricted_categories": ["digital currencies", "software subscriptions", "weapons"],
    "human_approval_required": True,
}


def init_db() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS decision_proofs (decision_id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, approved_at TEXT)"))
        connection.execute(text("CREATE TABLE IF NOT EXISTS policy_settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"))
        connection.execute(text("CREATE TABLE IF NOT EXISTS policy_events (event_id TEXT PRIMARY KEY, action TEXT NOT NULL, outcome TEXT NOT NULL, amount REAL, detail TEXT, context TEXT, created_at TEXT NOT NULL)"))
        for statement in ("ALTER TABLE decision_proofs ADD COLUMN paypal_order_id TEXT", "ALTER TABLE decision_proofs ADD COLUMN paypal_capture_id TEXT"):
            try:
                connection.execute(text(statement))
            except Exception:
                pass


def save_proof(proof: dict) -> None:
    init_db()
    with engine.begin() as connection:
        connection.execute(text("INSERT OR REPLACE INTO decision_proofs (decision_id,status,payload,created_at,approved_at) VALUES (:id,:status,:payload,:created,:approved)"), {"id": proof["decision_id"], "status": proof["status"], "payload": json.dumps(proof), "created": proof["created_at"], "approved": None})


def get_proof(decision_id: str) -> dict | None:
    init_db()
    with engine.begin() as connection:
        row = connection.execute(text("SELECT payload,status,approved_at,paypal_order_id,paypal_capture_id FROM decision_proofs WHERE decision_id=:id"), {"id": decision_id}).mappings().first()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["status"] = row["status"]
    payload["approved_at"] = row["approved_at"]
    payload["paypal_order_id"] = row["paypal_order_id"]
    payload["paypal_capture_id"] = row["paypal_capture_id"]
    return payload


def approve_proof(decision_id: str) -> dict | None:
    init_db()
    with engine.connect() as connection:
        connection.execute(text("BEGIN IMMEDIATE"))
        row = connection.execute(text("SELECT payload,status FROM decision_proofs WHERE decision_id=:id"), {"id": decision_id}).mappings().first()
        if not row or row["status"] != "awaiting_approval":
            return None
        proof = json.loads(row["payload"])
        from app.services.proof import proof_hash
        if not proof.get("integrity_hash") or proof_hash(proof) != proof["integrity_hash"]:
            return None

        settings_row = connection.execute(text("SELECT payload FROM policy_settings WHERE id=1")).mappings().first()
        settings = {**DEFAULT_POLICY, **(json.loads(settings_row["payload"]) if settings_row else {})}
        month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
        committed_rows = connection.execute(text("SELECT payload FROM decision_proofs WHERE status IN ('approved','checkout_pending','completed')")).mappings().all()
        committed = sum(
            (Decimal(str(json.loads(item["payload"]).get("optimization", {}).get("total") or 0))
             for item in committed_rows
             if str(json.loads(item["payload"]).get("created_at", "")).startswith(month_prefix)),
            Decimal("0"),
        )
        total = Decimal(str(proof.get("optimization", {}).get("total") or 0))
        if committed + total > Decimal(str(settings["monthly_cap"])):
            return None

        now = datetime.now(timezone.utc).isoformat()
        proof["status"] = "approved"
        proof["approved_at"] = now
        updated = connection.execute(
            text("UPDATE decision_proofs SET status='approved', approved_at=:approved, payload=:payload WHERE decision_id=:id AND status='awaiting_approval'"),
            {"id": decision_id, "approved": now, "payload": json.dumps(proof)},
        )
        if updated.rowcount != 1:
            return None
        connection.commit()
        return proof


def reject_proof(decision_id: str) -> dict | None:
    proof = get_proof(decision_id)
    if not proof or proof["status"] != "awaiting_approval":
        return None
    now = datetime.now(timezone.utc).isoformat()
    proof["status"] = "rejected"
    proof["rejected_at"] = now
    with engine.begin() as connection:
        updated = connection.execute(text("UPDATE decision_proofs SET status='rejected', payload=:payload WHERE decision_id=:id AND status='awaiting_approval'"), {"id": decision_id, "payload": json.dumps(proof)})
        if updated.rowcount != 1:
            return None
    return proof


def record_paypal_order(decision_id: str, order_id: str) -> dict | None:
    proof = get_proof(decision_id)
    if not proof or proof.get("status") != "approved":
        return None
    proof["status"] = "checkout_pending"
    with engine.begin() as connection:
        updated = connection.execute(text("UPDATE decision_proofs SET status='checkout_pending', paypal_order_id=:order_id, payload=:payload WHERE decision_id=:id AND status='approved'"), {"id": decision_id, "order_id": order_id, "payload": json.dumps(proof)})
        if updated.rowcount != 1:
            return None
    return proof


def get_proof_by_order_id(order_id: str) -> dict | None:
    init_db()
    with engine.begin() as connection:
        row = connection.execute(text("SELECT payload,status,approved_at,paypal_order_id,paypal_capture_id FROM decision_proofs WHERE paypal_order_id=:order_id"), {"order_id": order_id}).mappings().first()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload.update(status=row["status"], approved_at=row["approved_at"], paypal_order_id=row["paypal_order_id"], paypal_capture_id=row["paypal_capture_id"])
    return payload


def record_paypal_capture(order_id: str, capture_id: str) -> dict | None:
    if not capture_id:
        return None
    init_db()
    with engine.begin() as connection:
        row = connection.execute(text("SELECT decision_id,payload,status FROM decision_proofs WHERE paypal_order_id=:order_id"), {"order_id": order_id}).mappings().first()
        if not row or row["status"] != "checkout_pending":
            return None
        proof = json.loads(row["payload"])
        proof["status"] = "completed"
        proof["paypal_capture_id"] = capture_id
        updated = connection.execute(text("UPDATE decision_proofs SET status='completed', paypal_capture_id=:capture_id, payload=:payload WHERE decision_id=:id AND status='checkout_pending'"), {"id": row["decision_id"], "capture_id": capture_id, "payload": json.dumps(proof)})
        if updated.rowcount != 1:
            return None
        return proof


def list_proofs() -> list[dict]:
    init_db()
    with engine.begin() as connection:
        rows = connection.execute(text("SELECT payload,status,approved_at,paypal_order_id,paypal_capture_id FROM decision_proofs ORDER BY created_at DESC" )).mappings().all()
    results = []
    for row in rows:
        item = json.loads(row["payload"])
        item.update(status=row["status"], approved_at=row["approved_at"], paypal_order_id=row["paypal_order_id"], paypal_capture_id=row["paypal_capture_id"])
        results.append(item)
    return results


def get_policy_settings() -> dict:
    init_db()
    with engine.begin() as connection:
        row = connection.execute(text("SELECT payload,updated_at FROM policy_settings WHERE id=1")).mappings().first()
    if not row:
        payload = dict(DEFAULT_POLICY)
        save_policy_settings(payload)
        return payload
    payload = {**DEFAULT_POLICY, **json.loads(row["payload"])}
    return payload


def save_policy_settings(payload: dict) -> dict:
    init_db()
    now = datetime.now(timezone.utc).isoformat()
    with engine.begin() as connection:
        connection.execute(text("INSERT OR REPLACE INTO policy_settings (id,payload,updated_at) VALUES (1,:payload,:updated)"), {"payload": json.dumps(payload), "updated": now})
    return payload


def reset_policy_settings() -> dict:
    return save_policy_settings(dict(DEFAULT_POLICY))


def record_policy_event(action: str, outcome: str, amount: float | None = None, detail: str = "", context: str = "") -> dict:
    init_db()
    event = {
        "event_id": f"EVT-{uuid4().hex[:10].upper()}",
        "action": action,
        "outcome": outcome,
        "amount": amount,
        "detail": detail,
        "context": context,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO policy_events (event_id,action,outcome,amount,detail,context,created_at) VALUES (:event_id,:action,:outcome,:amount,:detail,:context,:created_at)"), event)
    return event


def list_policy_events(limit: int = 20) -> list[dict]:
    init_db()
    with engine.begin() as connection:
        rows = connection.execute(text("SELECT event_id,action,outcome,amount,detail,context,created_at FROM policy_events ORDER BY created_at DESC LIMIT :limit"), {"limit": limit}).mappings().all()
    return [dict(row) for row in rows]


def policy_stats() -> dict:
    init_db()
    with engine.begin() as connection:
        rows = connection.execute(text("SELECT outcome,COUNT(*) AS total FROM policy_events GROUP BY outcome")).mappings().all()
        monthly = connection.execute(text("SELECT payload FROM decision_proofs WHERE status IN ('approved','checkout_pending','completed')")).mappings().all()
    counts = {row["outcome"].lower(): row["total"] for row in rows}
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    committed = 0.0
    for row in monthly:
        payload = json.loads(row["payload"])
        if str(payload.get("created_at", "")).startswith(month_prefix):
            committed += float(payload.get("optimization", {}).get("total") or 0)
    return {
        "evaluations": sum(counts.values()),
        "blocked": counts.get("blocked", 0),
        "awaiting_approval": counts.get("awaiting_approval", 0),
        "passed": counts.get("passed", 0),
        "monthly_committed": round(committed, 2),
    }
