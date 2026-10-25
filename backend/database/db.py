"""
Database engine + session setup.

Defaults to a local SQLite file so the whole app runs with zero
external dependencies. Set DATABASE_URL to point at Postgres once
you're running docker-compose or a leased server:

    export DATABASE_URL=postgresql://care:care@localhost:5432/care_platform
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./care_platform.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
