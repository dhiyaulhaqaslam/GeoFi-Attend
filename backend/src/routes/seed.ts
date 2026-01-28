import express from "express";
import { db } from "../database";

const router = express.Router();

/**
 * Jalankan sekali:
 *   POST http://localhost:3001/api/seed
 *
 * Opsional reset (HATI-HATI, ini hapus user id 1..4):
 *   POST http://localhost:3001/api/seed?force=1
 */
router.post("/", async (req, res) => {
   const force = String(req.query.force ?? "") === "1";

   try {
      if (force) {
         // HATI-HATI: kalau sudah ada attendance_records yang refer ke user_id ini, jangan force.
         await db.run(`DELETE FROM users WHERE id IN (1,2,3,4)`);
      }

      // USERS (lengkap: email + timestamps)
      await db.run(`
      INSERT OR IGNORE INTO users (id, username, name, email, role, created_at, updated_at)
      VALUES
        (1, 'admin',    'Administrator', 'admin@company.com',    'admin',    datetime('now'), datetime('now')),
        (2, 'pegawai1', 'Pegawai Satu',  'pegawai1@company.com', 'employee', datetime('now'), datetime('now')),
        (3, 'pegawai2', 'Pegawai Dua',   'pegawai2@company.com', 'employee', datetime('now'), datetime('now')),
        (4, 'pegawai3', 'Pegawai Tiga',  'pegawai3@company.com', 'employee', datetime('now'), datetime('now'))
    `);

      // OFFICE demo (kalau belum ada)
      await db.run(`
      INSERT OR IGNORE INTO offices (id, name, latitude, longitude, radius_meters, address)
      VALUES
        (1, 'Kantor Makassar (Test)', -5.179337, 119.432507, 300, 'Tamalate, Mannuruki, Makassar')
    `);

      // Debug: pastikan kita lihat DB file yang sedang dipakai proses backend
      const dbList = await db.all<{ seq: number; name: string; file: string }>(
         `PRAGMA database_list`
      );

      const users = await db.all<any>(
         `SELECT id, username, name, email, role FROM users ORDER BY id`
      );

      const offices = await db.all<any>(
         `SELECT id, name, radius_meters FROM offices ORDER BY id`
      );

      return res.json({
         success: true,
         message: "Seed OK (users + office)",
         db_file: dbList?.[0]?.file ?? null,
         users_count: users.length,
         users,
         offices,
      });
   } catch (e: any) {
      console.error("Seed error:", e);
      return res.status(500).json({
         success: false,
         error: e?.message || "Seed failed",
      });
   }
});

export default router;
