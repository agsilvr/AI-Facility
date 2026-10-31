import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FacilityState, QueueArchive } from "../src/core/types";
import type { AuditEntry } from "./agents/reader";

/**
 * Local SQLite storage on the Mac mini. The live state is saved as one
 * snapshot row; every log entry is also kept in a history table, so nothing
 * that happened is lost when old entries drop out of the live view. Every AI
 * call is written to an append-only audit table.
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
      CREATE TABLE IF NOT EXISTS audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        source TEXT NOT NULL,
        input_sha256 TEXT NOT NULL,
        output_sha256 TEXT,
        ok INTEGER NOT NULL,
        error TEXT,
        cost_usd REAL NOT NULL,
        flags TEXT NOT NULL
      );
      -- The audit trail is append-only: the database itself refuses edits and deletes.
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
        BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
        BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS queue_archives (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        archive TEXT NOT NULL
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

  queueArchive(id: string): QueueArchive | null {
    const row = this.db.prepare("SELECT archive FROM queue_archives WHERE id = ?").get(id) as { archive: string } | undefined;
    return row ? JSON.parse(row.archive) as QueueArchive : null;
  }

  /** The archive, empty queue and disabled legacy product generator commit together. */
  saveQueueReset(archive: QueueArchive, state: FacilityState) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO queue_archives (id, at, archive) VALUES (?, ?, ?)")
        .run(archive.id, archive.at, JSON.stringify(archive));
      this.db.prepare("INSERT INTO snapshot (id, saved_at, state) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET saved_at = excluded.saved_at, state = excluded.state")
        .run(Date.now(), JSON.stringify(state));
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('automatic_products', 'false') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  addAudit(e: AuditEntry) {
    this.db
      .prepare(
        "INSERT INTO audit (at, purpose, source, input_sha256, output_sha256, ok, error, cost_usd, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(e.at, e.purpose, e.source, e.inputSha256, e.outputSha256, e.ok ? 1 : 0, e.error, e.costUsd, JSON.stringify(e.flags));
  }

  auditEntries(limit = 100): AuditEntry[] {
    const rows = this.db.prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      at: r.at as number,
      purpose: r.purpose as string,
      source: r.source as string,
      inputSha256: r.input_sha256 as string,
      outputSha256: (r.output_sha256 as string | null) ?? null,
      ok: r.ok === 1,
      error: (r.error as string | null) ?? null,
      costUsd: r.cost_usd as number,
      flags: JSON.parse(r.flags as string) as string[],
    }));
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  historyCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM history").get() as { n: number }).n;
  }

  close() {
    this.db.close();
  }
}
