import pytest
from sqlalchemy import create_engine


@pytest.fixture
def database(tmp_path, monkeypatch):
    """Point the persistence layer at an isolated SQLite database."""
    import app.persistence.db as db

    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db, "engine", engine)
    db.init_db()
    yield db
    engine.dispose()
