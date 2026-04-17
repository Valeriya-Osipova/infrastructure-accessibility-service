"""
Управление подключением к PostgreSQL/PostGIS.

Использует psycopg2 connection pool для синхронных запросов из алгоритмов и репозиториев.
DATABASE_URL задаётся через переменную окружения или .env файл.
"""

import os
from contextlib import contextmanager
from typing import Generator

import psycopg2
from psycopg2 import pool as pg_pool

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/infrastructure",
)

_pool: pg_pool.ThreadedConnectionPool | None = None


def get_pool() -> pg_pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = pg_pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=DATABASE_URL,
        )
    return _pool


@contextmanager
def db_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """Контекстный менеджер: берёт соединение из пула и возвращает его после использования."""
    conn = get_pool().getconn()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        get_pool().putconn(conn)


def is_db_available() -> bool:
    """Проверяет доступность базы данных без исключений."""
    try:
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True
    except Exception:
        return False
