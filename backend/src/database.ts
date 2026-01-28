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
   timestamp: string; // SQLite datetime string: "YYYY-MM-DD HH:MM:SS"
   latitude: number;
   longitude: number;
   distance_to_office_m: number;
   geofence_status: "PASS" | "FAIL";
   wifi_ssid?: string;
   wifi_bssid?: string;
   wifi_status: "PASS" | "FAIL" | "NOT_CHECKED"; // di web: ini dipakai untuk "NETWORK PASS/FAIL"
   ip_address?: string;
   user_agent: string;
   notes?: string;
   created_at: string;
}

type RunResult = { lastID: number; changes: number };

class Database {
   private db: sqlite3.Database;

   constructor() {
      this.db = new sqlite3.Database("./attendance.db", (err) => {
         if (err) {
            console.error("Error opening database:", err.message);
         } else {
            console.log("Connected to SQLite database.");
            this.initTables();
         }
      });
   }

   private initTables(): void {
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

      -- disiapkan untuk mobile app (SSID/BSSID). Website tidak bisa verifikasi SSID/BSSID secara aman.
      CREATE TABLE IF NOT EXISTS office_wifi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        office_id INTEGER NOT NULL,
        ssid TEXT NOT NULL,
        bssid TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (office_id) REFERENCES offices (id) ON DELETE CASCADE
      );

      -- INI yang dipakai untuk "wajib WiFi" versi web (IP/CIDR whitelist)
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
        type TEXT NOT NULL CHECK(type IN ('checkin', 'checkout')),
        timestamp DATETIME NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        distance_to_office_m REAL NOT NULL,
        geofence_status TEXT NOT NULL CHECK(geofence_status IN ('PASS', 'FAIL')),
        wifi_ssid TEXT,
        wifi_bssid TEXT,
        wifi_status TEXT DEFAULT 'NOT_CHECKED' CHECK(wifi_status IN ('PASS', 'FAIL', 'NOT_CHECKED')),
        ip_address TEXT,
        user_agent TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (office_id) REFERENCES offices (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_attendance_user_time ON attendance_records(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_attendance_office_time ON attendance_records(office_id, timestamp);
    `;

      this.db.exec(schemaSql, (err) => {
         if (err) {
            console.error("Error initializing schema:", err.message);
            return;
         }

         // seed default data (aman, idempotent)
         const seedSql = `
        INSERT OR IGNORE INTO offices (id, name, latitude, longitude, radius_meters, address) VALUES
          (1, 'Kantor Pusat', -6.2088, 106.8456, 100, 'Jl. Sudirman No. 1, Jakarta');

        -- DEV whitelist (localhost)
        INSERT OR IGNORE INTO office_networks (office_id, cidr) VALUES
          (1, '127.0.0.1/32');

        -- CONTOH LAN kantor (ubah sesuai LAN WiFi kantor kamu)
        INSERT OR IGNORE INTO office_networks (office_id, cidr) VALUES
          (1, '192.168.1.0/24');

        INSERT OR IGNORE INTO users (id, username, name, email, role) VALUES
          (1, 'admin', 'Administrator', 'admin@company.com', 'admin');

        INSERT OR IGNORE INTO users (id, username, name, email, role) VALUES
          (2, 'pegawai1', 'Pegawai Satu', 'pegawai1@company.com', 'employee');
      `;

         this.db.exec(seedSql, (seedErr) => {
            if (seedErr) {
               console.error("Error seeding data:", seedErr.message);
            }
         });
      });
   }

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
