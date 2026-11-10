import json
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from app.core.config import get_settings

engine = create_engine(get_settings().omnibuy_database_url, connect_args={"check_same_thread": False} if get_settings().omnibuy_database_url.startswith("sqlite") else {})


def init_db() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS decision_proofs (decision_id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, approved_at TEXT)"))


def save_proof(proof: dict) -> None:
    init_db()
    with engine.begin() as connection:
        connection.execute(text("INSERT OR REPLACE INTO decision_proofs (decision_id,status,payload,created_at,approved_at) VALUES (:id,:status,:payload,:created,:approved)"), {"id": proof["decision_id"], "status": proof["status"], "payload": json.dumps(proof), "created": proof["created_at"], "approved": None})


def get_proof(decision_id: str) -> dict | None:
    init_db()
    with engine.begin() as connection:
        row = connection.execute(text("SELECT payload,status,approved_at FROM decision_proofs WHERE decision_id=:id"), {"id": decision_id}).mappings().first()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["status"] = row["status"]
    payload["approved_at"] = row["approved_at"]
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
