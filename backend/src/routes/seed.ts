// backend/src/routes/seed.ts
import express from "express";
import { db } from "../database";

const router = express.Router();

/**
 * Jalankan:
 *   POST http://localhost:3001/api/seed
 *
 * Reset (HATI-HATI, hapus user & attendance user id 1..11):
 *   POST http://localhost:3001/api/seed?force=1
 *
 * Bersihkan office_networks (hapus semua lalu isi 1 baris):
 *   POST http://localhost:3001/api/seed/clean-office-networks
 */
router.post("/", async (req, res) => {
   const force = String(req.query.force ?? "") === "1";

   try {
      if (force) {
         await db.run(
            `DELETE FROM attendance_records WHERE user_id BETWEEN 1 AND 11`
         );
         await db.run(`DELETE FROM users WHERE id BETWEEN 1 AND 11`);
      }

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

      await db.run(`
  INSERT INTO offices (id, name, latitude, longitude, radius_meters, address)
  VALUES
    (1, 'Kantor Bungayya', -5.170628, 119.415447, 20, 'Bongaya, Kec. Tamalate, Kota Makassar'),
    (2, 'Kantor Mannuruki', -5.179335212613516, 119.43250910494449, 20, 'Kota Makassar'),
    (3, 'Kantor Hertasning', -5.164504371092612, 119.44780487485085, 20, 'Kota Makassar'),
    (4, 'Kantor Digides', -5.180751, 119.463958, 20, 'Kota Gowa'),
    (5, 'Kantor Dekat Digides', -5.180964150904347, 119.46412619031521, 20, 'Kota Gowa')
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    radius_meters=excluded.radius_meters,
    address=excluded.address;
`);

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

router.post("/clean-office-networks", async (_req, res) => {
   try {
      await db.run(`DELETE FROM office_networks WHERE office_id = 1`);
      // isi 1 saja untuk dev (opsional)
      await db.run(
         `INSERT OR IGNORE INTO office_networks (office_id, cidr) VALUES (1, '127.0.0.1/32')`
      );
      return res.json({
         success: true,
         message: "office_networks dibersihkan (office_id=1)",
      });
   } catch (e: any) {
      return res
         .status(500)
         .json({ success: false, error: e?.message || "failed" });
   }
});

export default router;
