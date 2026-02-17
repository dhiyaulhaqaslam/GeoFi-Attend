// backend/src/database.ts
import sqlite3 from "sqlite3";

export interface User {
   id: number;
   username: string;
   name: string;
   email: string;
   role: "employee" | "admin";
   created_at: string;
   updated_at: string;
}

export interface Office {
   id: number;
   name: string;
   latitude: number;
   longitude: number;
   radius_meters: number;
   address: string;
   created_at: string;
   updated_at: string;
}

export interface OfficeWifi {
   id: number;
   office_id: number;
   ssid: string;
   bssid: string;
   created_at: string;
}

export interface AttendanceRecord {
   id: number;
   user_id: number;
   office_id: number;
   type: "checkin" | "checkout";
   timestamp: string;
   latitude: number;
   longitude: number;
   distance_to_office_m: number;
   geofence_status: "PASS" | "FAIL";
   wifi_status: "PASS" | "FAIL" | "NOT_CHECKED";
   ip_address?: string;
   user_agent: string;
   notes?: string;
   created_at: string;

   // kolom baru untuk face (opsional di query)
   face_status?: "PASS" | "FAIL" | "NOT_CHECKED";
   face_distance?: number | null;
   face_model?: string | null;
}

export interface UserFaceTemplate {
   id: number;
   user_id: number;
   embedding: Buffer; // BLOB bytes
   model: string;
   created_at: string;
}

type RunResult = { lastID: number; changes: number };

class Database {
   private db: sqlite3.Database;

   constructor() {
      this.db = new sqlite3.Database("./attendance.db", (err) => {
         if (err) {
            console.error("Error opening database:", err.message);
            return;
         }
         console.log("Connected to SQLite database.");
         // init async berurutan (tidak race). tidak perlu await di constructor.
         void this.initTables();
      });
   }

   // --- Helpers untuk async/await ---
   private exec(sql: string): Promise<void> {
      return new Promise((resolve, reject) => {
         this.db.exec(sql, (err) => (err ? reject(err) : resolve()));
      });
   }

   private tableInfo(table: string): Promise<Array<{ name: string }>> {
      return new Promise((resolve, reject) => {
         this.db.all(`PRAGMA table_info(${table});`, [], (err, rows: any[]) => {
            if (err) return reject(err);
            resolve((rows ?? []).map((r) => ({ name: String(r.name) })));
         });
      });
   }

   private async ensureColumn(
      table: string,
      column: string,
      ddl: string
   ): Promise<void> {
      try {
         const cols = await this.tableInfo(table);
         const exists = cols.some((c) => c.name === column);
         if (exists) return;

         await new Promise<void>((resolve, reject) => {
            this.db.run(ddl, (err) => (err ? reject(err) : resolve()));
         });
         console.log(`[DB] Added column ${table}.${column}`);
      } catch (e: any) {
         // Jangan bikin startup mati — tapi log jelas
         console.error(
            `[DB] ensureColumn failed for ${table}.${column}:`,
            e?.message || e
         );
      }
   }

   // --- Init schema: deterministic & restart-safe ---
   private async initTables(): Promise<void> {
      const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'employee',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS office_wifi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL,
  ssid TEXT NOT NULL,
  bssid TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (office_id) REFERENCES offices (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS office_networks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL,
  cidr TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (office_id) REFERENCES offices (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  office_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('checkin','checkout')),
  timestamp DATETIME NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  distance_to_office_m REAL NOT NULL,
  geofence_status TEXT NOT NULL CHECK(geofence_status IN ('PASS','FAIL')),
  wifi_status TEXT DEFAULT 'NOT_CHECKED' CHECK(wifi_status IN ('PASS','FAIL','NOT_CHECKED')),
  ip_address TEXT,
  user_agent TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (office_id) REFERENCES offices (id) ON DELETE CASCADE
);

-- Face templates (embedding per user)
CREATE TABLE IF NOT EXISTS user_face_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_face_user ON user_face_templates(user_id);

-- indeks attendance
CREATE INDEX IF NOT EXISTS idx_attendance_user_time ON attendance_records(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_office_time ON attendance_records(office_id, timestamp);
`;

      const cleanupDuplicates = `
DELETE FROM office_networks
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM office_networks
  GROUP BY office_id, cidr
);
`;

      const uniqueIndexSql = `
CREATE UNIQUE INDEX IF NOT EXISTS uq_office_networks_office_cidr
ON office_networks(office_id, cidr);
`;

      try {
         // 1) base schema
         await this.exec(schemaSql);

         // 2) kolom baru untuk attendance_records (restart-safe)
         await this.ensureColumn(
            "attendance_records",
            "face_status",
            "ALTER TABLE attendance_records ADD COLUMN face_status TEXT DEFAULT 'NOT_CHECKED'"
         );
         await this.ensureColumn(
            "attendance_records",
            "face_distance",
            "ALTER TABLE attendance_records ADD COLUMN face_distance REAL"
         );
         await this.ensureColumn(
            "attendance_records",
            "face_model",
            "ALTER TABLE attendance_records ADD COLUMN face_model TEXT"
         );

         // 3) cleanup + unique index
         await this.exec(cleanupDuplicates);
         await this.exec(uniqueIndexSql);

         console.log("[DB] Schema init OK");
      } catch (e: any) {
         console.error("[DB] Error initializing schema:", e?.message || e);
      }
   }

   // --- Public query methods ---
   run(query: string, params: any[] = []): Promise<RunResult> {
      return new Promise((resolve, reject) => {
         this.db.run(query, params, function (this: sqlite3.RunResult, err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
         });
      });
   }

   get<T>(query: string, params: any[] = []): Promise<T | undefined> {
      return new Promise((resolve, reject) => {
         this.db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row as T);
         });
      });
   }

   all<T>(query: string, params: any[] = []): Promise<T[]> {
      return new Promise((resolve, reject) => {
         this.db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows as T[]);
         });
      });
   }

   close(): void {
      this.db.close((err) => {
         if (err) console.error("Error closing database:", err.message);
         else console.log("Database connection closed.");
      });
   }
}

export const db = new Database();
