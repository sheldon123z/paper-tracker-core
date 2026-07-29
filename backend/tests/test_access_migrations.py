import tempfile
import unittest
from pathlib import Path

from backend.app.control_plane.migrations import migrate_control_schema
from backend.app.services.db_migrations import migrate_database_schema
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


class AccessMigrationTests(unittest.TestCase):
    def test_paper_scope_migration_is_idempotent_and_creates_one_backup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "paper_tracker.db"
            engine = create_engine(f"sqlite:///{database_path}")
            try:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "CREATE TABLE papers (id INTEGER PRIMARY KEY, title TEXT, source TEXT, category TEXT, created_at DATETIME, published_date DATETIME, relevance REAL)"
                        )
                    )
                    connection.execute(text("CREATE TABLE feeds (id INTEGER PRIMARY KEY)"))
                    connection.execute(text("CREATE TABLE tags (id INTEGER PRIMARY KEY)"))
                migrate_database_schema(engine)
                migrate_database_schema(engine)

                inspector = inspect(engine)
                self.assertIn("visibility", {column["name"] for column in inspector.get_columns("papers")})
                self.assertIn("department_id", {column["name"] for column in inspector.get_columns("feeds")})
                self.assertIn("created_by_user_id", {column["name"] for column in inspector.get_columns("tags")})
                self.assertIn("user_id", {column["name"] for column in inspector.get_columns("llm_usage_logs")})
                backups = list(Path(temp_dir).glob("paper_tracker.db.bak-before-access-control-papers-*"))
                self.assertEqual(len(backups), 1)
                self.assertGreater(backups[0].stat().st_size, 0)
            finally:
                engine.dispose()

    def test_control_migration_maps_roles_and_backfills_session_keys_once(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "control_plane.db"
            engine = create_engine(f"sqlite:///{database_path}")
            try:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "CREATE TABLE departments (id INTEGER PRIMARY KEY, code TEXT, name TEXT, status TEXT, created_at DATETIME, updated_at DATETIME)"
                        )
                    )
                    connection.execute(
                        text("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, usage_level VARCHAR(8))")
                    )
                    connection.execute(
                        text("INSERT INTO users (id, role, usage_level) VALUES (1, 'admin', NULL), (2, 'user', 'A')")
                    )
                    connection.execute(text("CREATE TABLE user_sessions (id INTEGER PRIMARY KEY, user_id INTEGER)"))
                    connection.execute(text("INSERT INTO user_sessions (id, user_id) VALUES (1, 1)"))
                    connection.execute(
                        text(
                            "CREATE TABLE audit_events (id INTEGER PRIMARY KEY, actor_user_id INTEGER, department_id INTEGER, created_at DATETIME)"
                        )
                    )
                migrate_control_schema(engine)
                with engine.connect() as connection:
                    first_key = connection.execute(
                        text("SELECT session_key FROM user_sessions WHERE id=1")
                    ).scalar_one()
                migrate_control_schema(engine)

                with engine.connect() as connection:
                    roles = {row.id: row.role for row in connection.execute(text("SELECT id, role FROM users"))}
                    second_key = connection.execute(
                        text("SELECT session_key FROM user_sessions WHERE id=1")
                    ).scalar_one()
                self.assertEqual(roles, {1: "manager", 2: "user"})
                self.assertNotIn("usage_level", {column["name"] for column in inspect(engine).get_columns("users")})
                self.assertEqual(first_key, second_key)
                self.assertTrue(first_key)
                backups = list(Path(temp_dir).glob("control_plane.db.bak-before-access-control-control-*"))
                self.assertEqual(len(backups), 1)
            finally:
                engine.dispose()

    def _control_engine_with_users(self, temp_dir, rows):
        database_path = Path(temp_dir) / "control_plane.db"
        engine = create_engine(f"sqlite:///{database_path}")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE departments (id INTEGER PRIMARY KEY, code TEXT, name TEXT, status TEXT, created_at DATETIME, updated_at DATETIME)"
                )
            )
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT)"))
            connection.execute(text("CREATE TABLE user_sessions (id INTEGER PRIMARY KEY, user_id INTEGER)"))
            connection.execute(
                text(
                    "CREATE TABLE audit_events (id INTEGER PRIMARY KEY, actor_user_id INTEGER, department_id INTEGER, created_at DATETIME)"
                )
            )
            for user_id, role in rows:
                connection.execute(
                    text("INSERT INTO users (id, role) VALUES (:id, :role)"),
                    {"id": user_id, "role": role},
                )
        return engine

    def _roles(self, engine):
        with engine.connect() as connection:
            return {row.id: row.role for row in connection.execute(text("SELECT id, role FROM users"))}

    def test_bootstrap_promotes_earliest_account_when_no_manager_exists(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # 乱序插入，确认挑选依据是主键顺序（即创建顺序）而非插入顺序。
            engine = self._control_engine_with_users(temp_dir, [(5, "user"), (2, "user"), (9, "user")])
            try:
                migrate_control_schema(engine)
                self.assertEqual(self._roles(engine), {2: "manager", 5: "user", 9: "user"})
                migrate_control_schema(engine)
                self.assertEqual(self._roles(engine), {2: "manager", 5: "user", 9: "user"})
            finally:
                engine.dispose()

    def test_bootstrap_leaves_roles_untouched_when_a_manager_exists(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            engine = self._control_engine_with_users(temp_dir, [(1, "user"), (2, "manager")])
            try:
                migrate_control_schema(engine)
                self.assertEqual(self._roles(engine), {1: "user", 2: "manager"})
            finally:
                engine.dispose()

    def test_bootstrap_tolerates_empty_user_table(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            engine = self._control_engine_with_users(temp_dir, [])
            try:
                migrate_control_schema(engine)
                self.assertEqual(self._roles(engine), {})
            finally:
                engine.dispose()

    def test_tag_migration_replaces_global_name_uniqueness_with_scope_uniqueness(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "paper_tracker.db"
            engine = create_engine(f"sqlite:///{database_path}")
            try:
                with engine.begin() as connection:
                    connection.execute(
                        text("""
                        CREATE TABLE tags (
                            id INTEGER PRIMARY KEY,
                            name VARCHAR(64) NOT NULL UNIQUE,
                            color VARCHAR(16),
                            updated_at DATETIME
                        )
                    """)
                    )
                    connection.execute(
                        text("""
                        CREATE TABLE paper_tags (
                            id INTEGER PRIMARY KEY,
                            paper_id INTEGER NOT NULL,
                            tag_id INTEGER NOT NULL REFERENCES tags(id)
                        )
                    """)
                    )
                    connection.execute(text("INSERT INTO tags (id, name) VALUES (1, 'shared')"))
                    connection.execute(text("INSERT INTO paper_tags (id, paper_id, tag_id) VALUES (1, 10, 1)"))

                migrate_database_schema(engine)
                migrate_database_schema(engine)

                with engine.begin() as connection:
                    connection.execute(
                        text("""
                        INSERT INTO tags (id, name, visibility, department_id)
                        VALUES (2, 'shared', 'department', 1),
                               (3, 'shared', 'department', 2)
                    """)
                    )
                    association = connection.execute(text("SELECT paper_id, tag_id FROM paper_tags WHERE id=1")).one()
                self.assertEqual(tuple(association), (10, 1))

                with self.assertRaises(IntegrityError):
                    with engine.begin() as connection:
                        connection.execute(
                            text("""
                            INSERT INTO tags (id, name, visibility, department_id)
                            VALUES (4, 'shared', 'public', NULL)
                        """)
                        )
                with self.assertRaises(IntegrityError):
                    with engine.begin() as connection:
                        connection.execute(
                            text("""
                            INSERT INTO tags (id, name, visibility, department_id)
                            VALUES (5, 'shared', 'department', 1)
                        """)
                        )
            finally:
                engine.dispose()

    def test_paper_and_feed_links_are_unique_within_scope_not_globally(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "paper_tracker.db"
            engine = create_engine(f"sqlite:///{database_path}")
            try:
                with engine.begin() as connection:
                    connection.execute(
                        text("""
                        CREATE TABLE feeds (
                            id INTEGER PRIMARY KEY,
                            name VARCHAR(255) NOT NULL,
                            url VARCHAR(1024) NOT NULL UNIQUE
                        )
                    """)
                    )
                    connection.execute(
                        text("""
                        CREATE TABLE papers (
                            id INTEGER PRIMARY KEY,
                            title VARCHAR(512) NOT NULL,
                            link VARCHAR(1024) UNIQUE,
                            source TEXT,
                            category TEXT,
                            created_at DATETIME,
                            published_date DATETIME,
                            relevance REAL,
                            source_feed_id INTEGER REFERENCES feeds(id)
                        )
                    """)
                    )
                    connection.execute(
                        text("""
                        CREATE TABLE paper_files (
                            id INTEGER PRIMARY KEY,
                            paper_id INTEGER NOT NULL REFERENCES papers(id),
                            filename TEXT,
                            storage_path TEXT,
                            file_type TEXT,
                            content_type TEXT
                        )
                    """)
                    )
                    connection.execute(text("INSERT INTO feeds (id, name, url) VALUES (1, 'public', 'https://feed')"))
                    connection.execute(
                        text(
                            "INSERT INTO papers (id, title, link, source_feed_id) "
                            "VALUES (1, 'public', 'https://paper', 1)"
                        )
                    )
                    connection.execute(text("INSERT INTO paper_files (id, paper_id) VALUES (1, 1)"))

                migrate_database_schema(engine)
                migrate_database_schema(engine)

                with engine.begin() as connection:
                    connection.execute(
                        text("""
                        INSERT INTO feeds (id, name, url, visibility, department_id)
                        VALUES (2, 'department one', 'https://feed', 'department', 1),
                               (3, 'department two', 'https://feed', 'department', 2)
                    """)
                    )
                    connection.execute(
                        text("""
                        INSERT INTO papers (id, title, link, visibility, department_id)
                        VALUES (2, 'department one', 'https://paper', 'department', 1),
                               (3, 'department two', 'https://paper', 'department', 2)
                    """)
                    )
                    linked_file = connection.execute(text("SELECT paper_id FROM paper_files WHERE id=1")).scalar_one()
                self.assertEqual(linked_file, 1)

                with self.assertRaises(IntegrityError):
                    with engine.begin() as connection:
                        connection.execute(
                            text("""
                            INSERT INTO papers (id, title, link, visibility, department_id)
                            VALUES (4, 'duplicate', 'https://paper', 'department', 1)
                        """)
                        )
                with self.assertRaises(IntegrityError):
                    with engine.begin() as connection:
                        connection.execute(
                            text("""
                            INSERT INTO feeds (id, name, url, visibility, department_id)
                            VALUES (4, 'duplicate', 'https://feed', 'public', NULL)
                        """)
                        )
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
