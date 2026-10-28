import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FacilityState } from "../src/core/types";

/**
 * Local SQLite storage on the Mac mini. The live state is saved as one
 * snapshot row; every log entry is also kept in a history table, so nothing
 * that happened is lost when old entries drop out of the live view.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        saved_at INTEGER NOT NULL,
        state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        wing_id TEXT,
        level TEXT NOT NULL,
        text TEXT NOT NULL
      );
    `);
  }

  load(): FacilityState | null {
    const row = this.db.prepare("SELECT state FROM snapshot WHERE id = 1").get() as { state: string } | undefined;
    return row ? (JSON.parse(row.state) as FacilityState) : null;
  }

  save(state: FacilityState) {
    const upsert = this.db.prepare(
      "INSERT INTO snapshot (id, saved_at, state) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET saved_at = excluded.saved_at, state = excluded.state",
    );
    const addHistory = this.db.prepare(
      "INSERT OR IGNORE INTO history (id, at, wing_id, level, text) VALUES (?, ?, ?, ?, ?)",
    );
    this.db.exec("BEGIN");
    try {
      upsert.run(Date.now(), JSON.stringify(state));
      for (const e of state.log) addHistory.run(e.id, e.at, e.wingId, e.level, e.text);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  historyCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM history").get() as { n: number }).n;
  }

  close() {
    this.db.close();
  }
}
