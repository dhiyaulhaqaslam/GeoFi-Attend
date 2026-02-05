import express from "express";
import { db } from "../database";

const router = express.Router();

/**
 * Jalankan:
 *   POST http://localhost:3001/api/seed
 *
 * Reset (HATI-HATI, hapus user & attendance user id 1..11):
 *   POST http://localhost:3001/api/seed?force=1
 */
router.post("/", async (req, res) => {
   const force = String(req.query.force ?? "") === "1";

   try {
      if (force) {
         // aman: jalankan terpisah (jangan gabung beberapa statement dalam 1 db.run)
         await db.run(
            `DELETE FROM attendance_records WHERE user_id BETWEEN 1 AND 11`
         );
         await db.run(`DELETE FROM users WHERE id BETWEEN 1 AND 11`);
      }

      // 1 admin + 10 pegawai
      await db.run(`
      INSERT OR IGNORE INTO users (id, username, name, email, role, created_at, updated_at)
      VALUES
        (1,  'admin',     'Administrator',   'admin@company.com',      'admin',    datetime('now'), datetime('now')),
        (2,  'pegawai1',  'Pegawai Satu',    'pegawai1@company.com',   'employee', datetime('now'), datetime('now')),
        (3,  'pegawai2',  'Pegawai Dua',     'pegawai2@company.com',   'employee', datetime('now'), datetime('now')),
        (4,  'pegawai3',  'Pegawai Tiga',    'pegawai3@company.com',   'employee', datetime('now'), datetime('now')),
        (5,  'pegawai4',  'Pegawai Empat',   'pegawai4@company.com',   'employee', datetime('now'), datetime('now')),
        (6,  'pegawai5',  'Pegawai Lima',    'pegawai5@company.com',   'employee', datetime('now'), datetime('now')),
        (7,  'pegawai6',  'Pegawai Enam',    'pegawai6@company.com',   'employee', datetime('now'), datetime('now')),
        (8,  'pegawai7',  'Pegawai Tujuh',   'pegawai7@company.com',   'employee', datetime('now'), datetime('now')),
        (9,  'pegawai8',  'Pegawai Delapan', 'pegawai8@company.com',   'employee', datetime('now'), datetime('now')),
        (10, 'pegawai9',  'Pegawai Sembilan','pegawai9@company.com',   'employee', datetime('now'), datetime('now')),
        (11, 'pegawai10', 'Pegawai Sepuluh', 'pegawai10@company.com',  'employee', datetime('now'), datetime('now'))
    `);

      // OFFICE demo (upsert)
      await db.run(`
      INSERT INTO offices (id, name, latitude, longitude, radius_meters, address)
      VALUES (1, 'Kantor Makassar', -5.170628, 119.415447, 20, 'Bongaya, Kec. Tamalate, Kota Makassar')
      ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         latitude=excluded.latitude,
         longitude=excluded.longitude,
         radius_meters=excluded.radius_meters,
         address=excluded.address
      `);

      // Debug: pastikan DB file yang benar
      const dbList = await db.all<{ seq: number; name: string; file: string }>(
         `PRAGMA database_list`
      );

      const users = await db.all<any>(
         `SELECT id, username, name, email, role FROM users ORDER BY id`
      );

      return res.json({
         success: true,
         message: "Seed OK (admin + 10 pegawai + office)",
         db_file: dbList?.[0]?.file ?? null,
         users_count: users.length,
         users,
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
