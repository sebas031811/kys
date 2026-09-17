from sqlalchemy import inspect, text

from app.database import engine


def _add_column_if_missing(table: str, column: str, ddl: str) -> None:
    insp = inspect(engine)
    if not insp.has_table(table):
        return
    columns = {c["name"] for c in insp.get_columns(table)}
    if column in columns:
        return
    with engine.begin() as conn:
        conn.execute(text(ddl))


def ensure_record_status_column() -> None:
    _add_column_if_missing("sales", "record_status", "ALTER TABLE sales ADD COLUMN record_status VARCHAR(20) DEFAULT 'venta'")
