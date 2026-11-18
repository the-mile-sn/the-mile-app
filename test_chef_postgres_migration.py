"""Ephemeral PostgreSQL migration contract for Chef accounts.

Run only with CHEF_PG_TEST_DATABASE_URL pointing to a disposable test DB.
Never execute on the Render production database.
"""
import os
import unittest
import psycopg
from psycopg.rows import dict_row
import chef_accounts_v2


class _Adapter:
    def __init__(self,conn):self.conn=conn
    def execute(self,sql,params=()):
        return self.conn.execute(sql.replace("?","%s"),params)


@unittest.skipUnless(os.getenv("CHEF_PG_TEST_DATABASE_URL"),"No disposable PostgreSQL configured")
class ChefPostgresMigrationTests(unittest.TestCase):
    def test_existing_users_sessions_and_links_survive_role_extension(self):
        url=os.environ["CHEF_PG_TEST_DATABASE_URL"]
        with psycopg.connect(url,row_factory=dict_row) as raw:
            raw.execute("""CREATE TABLE users (
                id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,
                username TEXT,role TEXT NOT NULL CHECK (role IN ('admin','player')),
                password TEXT,active INTEGER NOT NULL DEFAULT 1
            )""")
            raw.execute("""CREATE TABLE sessions(
                token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
                csrf TEXT NOT NULL,expires BIGINT NOT NULL
            )""")
            raw.execute("""CREATE TABLE v2_athletes(
                id TEXT PRIMARY KEY,name TEXT NOT NULL,
                archived_at BIGINT,weight_kg REAL
            )""")
            raw.execute("""CREATE TABLE v2_player_links(
                user_id TEXT PRIMARY KEY REFERENCES users(id),
                athlete_id TEXT NOT NULL UNIQUE REFERENCES v2_athletes(id)
            )""")
            raw.execute("INSERT INTO users(id,name,email,role) VALUES('player','Jogador','player@internal.test','player')")
            raw.execute("INSERT INTO users(id,name,email,role) VALUES('admin','Admin','admin@internal.test','admin')")
            raw.execute("INSERT INTO v2_athletes(id,name) VALUES('athlete','Jogador')")
            raw.execute("INSERT INTO v2_player_links(user_id,athlete_id) VALUES('player','athlete')")
            raw.execute("INSERT INTO sessions VALUES('sess','player','csrf',9999999999)")
            c=_Adapter(raw)
            chef_accounts_v2.enable_role(c)
            chef_accounts_v2.enable_role(c)
            chef_accounts_v2.initialize(c)
            c.execute("""INSERT INTO users(id,name,email,role)
                VALUES('chef','Chef','chef@internal.test','chef')""")
            c.execute("""INSERT INTO v2_chef_links(user_id,athlete_id,language,linked_at,created_by)
                VALUES('chef','athlete','pt',1,'admin')""")
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM sessions").fetchone()["n"],1)
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM v2_player_links").fetchone()["n"],1)
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM v2_chef_links").fetchone()["n"],1)
            with self.assertRaises(psycopg.errors.CheckViolation):
                c.execute("""INSERT INTO users(id,name,email,role)
                    VALUES('unknown','X','unknown@internal.test','superuser')""")
            raw.rollback()


if __name__=="__main__":unittest.main()
