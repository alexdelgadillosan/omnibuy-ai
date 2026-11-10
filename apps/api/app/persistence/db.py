import json
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from app.core.config import get_settings

engine = create_engine(get_settings().omnibuy_database_url, connect_args={"check_same_thread": False} if get_settings().omnibuy_database_url.startswith("sqlite") else {})


def init_db() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS decision_proofs (decision_id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, approved_at TEXT)"))
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
    proof = get_proof(decision_id)
    if not proof or proof["status"] != "awaiting_approval":
        return None
    now = datetime.now(timezone.utc).isoformat()
    proof["status"] = "approved"
    proof["approved_at"] = now
    with engine.begin() as connection:
        connection.execute(text("UPDATE decision_proofs SET status='approved', approved_at=:approved, payload=:payload WHERE decision_id=:id"), {"id": decision_id, "approved": now, "payload": json.dumps(proof)})
    return proof


def reject_proof(decision_id: str) -> dict | None:
    proof = get_proof(decision_id)
    if not proof or proof["status"] != "awaiting_approval":
        return None
    now = datetime.now(timezone.utc).isoformat()
    proof["status"] = "rejected"
    proof["rejected_at"] = now
    with engine.begin() as connection:
        connection.execute(text("UPDATE decision_proofs SET status='rejected', approved_at=:rejected, payload=:payload WHERE decision_id=:id"), {"id": decision_id, "rejected": now, "payload": json.dumps(proof)})
    return proof


def record_paypal_order(decision_id: str, order_id: str) -> dict | None:
    proof = get_proof(decision_id)
    if not proof or proof.get("status") != "approved":
        return None
    proof["status"] = "checkout_pending"
    with engine.begin() as connection:
        connection.execute(text("UPDATE decision_proofs SET status='checkout_pending', paypal_order_id=:order_id, payload=:payload WHERE decision_id=:id"), {"id": decision_id, "order_id": order_id, "payload": json.dumps(proof)})
    return proof


def record_paypal_capture(order_id: str, capture_id: str) -> dict | None:
    init_db()
    with engine.begin() as connection:
        row = connection.execute(text("SELECT decision_id,payload FROM decision_proofs WHERE paypal_order_id=:order_id"), {"order_id": order_id}).mappings().first()
        if not row:
            return None
        proof = json.loads(row["payload"])
        proof["status"] = "completed"
        proof["paypal_capture_id"] = capture_id
        connection.execute(text("UPDATE decision_proofs SET status='completed', paypal_capture_id=:capture_id, payload=:payload WHERE decision_id=:id"), {"id": row["decision_id"], "capture_id": capture_id, "payload": json.dumps(proof)})
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
