import express, { Request, Response, NextFunction } from "express";
import { db, AttendanceRecord, Office } from "../database";
import {
   checkGeofence,
   getCurrentTimestamp,
   getCurrentDate,
   normalizeIp,
} from "../utils";

const router = express.Router();

type AuthUser = {
   id: number;
   username: string;
   name: string;
   role: "admin" | "employee";
};

// =====================
// AUTH
// =====================
const authenticateUser = async (
   req: Request,
   res: Response,
   next: NextFunction
) => {
   try {
      const userIdRaw = req.headers["user-id"] as string;
      const userId = Number(userIdRaw);

      if (!userId || Number.isNaN(userId)) {
         return res.status(401).json({ error: "Authentication required" });
      }

      const user = await db.get<AuthUser>(
         "SELECT id, username, name, role FROM users WHERE id = ?",
         [userId]
      );

      if (!user) return res.status(401).json({ error: "User not found" });

      (req as any).user = user;
      next();
   } catch (e) {
      console.error("Auth error:", e);
      return res.status(500).json({ error: "Internal server error" });
   }
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
   const user = (req as any).user as AuthUser | undefined;
   if (!user) return res.status(401).json({ error: "Authentication required" });
   if (user.role !== "admin")
      return res.status(403).json({ error: "Admin only" });
   next();
};

function parseNumberStrict(v: any): number | null {
   const n = typeof v === "number" ? v : Number(v);
   if (!Number.isFinite(n)) return null;
   return n;
}

function parseIntStrict(v: any): number | null {
   const n = Number(v);
   if (!Number.isFinite(n)) return null;
   const i = Math.trunc(n);
   if (String(v).trim() === "" || i !== n) return null;
   return i;
}

function parseIntQuery(v: any): number | null {
   if (v === undefined || v === null || v === "") return null;
   const n = Number(v);
   if (!Number.isFinite(n)) return null;
   return Math.trunc(n);
}

function getClientIp(req: Request): string {
   const xf = req.headers["x-forwarded-for"] as string | undefined;
   if (xf) return normalizeIp(xf);
   return normalizeIp(req.ip);
}

// =====================
// PUBLIC: OFFICES
// =====================
router.get("/offices", async (_req, res) => {
   try {
      const offices = await db.all<Office>(
         "SELECT * FROM offices ORDER BY name"
      );
      res.json(offices);
   } catch (error) {
      console.error("Error fetching offices:", error);
      res.status(500).json({ error: "Internal server error" });
   }
});

// =====================
// DEMO USERS (untuk login demo frontend)
// =====================
router.get("/demo-users", async (_req, res) => {
   try {
      const users = await db.all<{
         id: number;
         username: string;
         name: string;
         role: "admin" | "employee";
      }>("SELECT id, username, name, role FROM users ORDER BY id");

      return res.json({ success: true, data: users });
   } catch (e) {
      console.error("Error fetching demo users:", e);
      return res.status(500).json({ error: "Internal server error" });
   }
});

// =====================
// ADMIN: USERS
// =====================
router.get(
   "/admin/users",
   authenticateUser,
   requireAdmin,
   async (_req, res) => {
      try {
         const users = await db.all<AuthUser>(
            "SELECT id, username, name, role FROM users ORDER BY id"
         );
         res.json({ success: true, data: users });
      } catch (e) {
         console.error("Admin users error:", e);
         res.status(500).json({ error: "Internal server error" });
      }
   }
);

// =====================
// ADMIN: RECORDS (filter optional)
// =====================
router.get(
   "/admin/records",
   authenticateUser,
   requireAdmin,
   async (req, res) => {
      try {
         const limit = Math.min(Number(req.query.limit ?? 500), 2000);
         const offset = Number(req.query.offset ?? 0);

         const officeId = parseIntQuery(req.query.officeId);
         const userId = parseIntQuery(req.query.userId);
         const date = (req.query.date as string | undefined) ?? "";

         const where: string[] = [];
         const params: any[] = [];

         if (officeId) {
            where.push("ar.office_id = ?");
            params.push(officeId);
         }
         if (userId) {
            where.push("ar.user_id = ?");
            params.push(userId);
         }
         if (date) {
            where.push("DATE(ar.timestamp) = ?");
            params.push(date);
         }

         const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

         const totalRow = await db.get<{ total: number }>(
            `SELECT COUNT(*) as total FROM attendance_records ar ${whereSql}`,
            params
         );

         const records = await db.all<any>(
            `SELECT ar.*,
              o.name as office_name,
              u.name as user_name
       FROM attendance_records ar
       JOIN offices o ON ar.office_id = o.id
       JOIN users u ON ar.user_id = u.id
       ${whereSql}
       ORDER BY ar.timestamp DESC
       LIMIT ? OFFSET ?`,
            [...params, limit, offset]
         );

         res.json({
            success: true,
            total: totalRow?.total ?? 0,
            data: records,
         });
      } catch (e) {
         console.error("Admin records error:", e);
         res.status(500).json({ error: "Internal server error" });
      }
   }
);

// =====================
// ADMIN: UPDATE RADIUS
// =====================
router.patch(
   "/admin/offices/:id/radius",
   authenticateUser,
   requireAdmin,
   async (req, res) => {
      const officeId = Number(req.params.id);
      const radius = Number(req.body.radius_meters);

      if (!officeId || !Number.isFinite(radius) || radius <= 0) {
         return res
            .status(400)
            .json({ error: "Invalid officeId / radius_meters" });
      }

      await db.run(`UPDATE offices SET radius_meters = ? WHERE id = ?`, [
         radius,
         officeId,
      ]);

      const office = await db.get(`SELECT * FROM offices WHERE id = ?`, [
         officeId,
      ]);
      return res.json({ success: true, data: office });
   }
);

// =====================
// USER: RECORDS (HANYA USER ITU)
// =====================
router.get("/records", authenticateUser, async (req, res) => {
   try {
      const user = (req as any).user as AuthUser;
      const userId = user.id;

      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);

      const records = await db.all<any>(
         `SELECT ar.*,
              o.name as office_name,
              u.name as user_name
       FROM attendance_records ar
       JOIN offices o ON ar.office_id = o.id
       JOIN users u ON ar.user_id = u.id
       WHERE ar.user_id = ?
       ORDER BY ar.timestamp DESC
       LIMIT ? OFFSET ?`,
         [userId, limit, offset]
      );

      res.json({ success: true, data: records });
   } catch (error) {
      console.error("Error fetching attendance records:", error);
      res.status(500).json({ error: "Internal server error" });
   }
});

async function getOfficeOr404(officeId: number) {
   const office = await db.get<Office>("SELECT * FROM offices WHERE id = ?", [
      officeId,
   ]);
   return office ?? null;
}

// =====================
// CHECK-IN (STRICT)
// =====================
router.post("/checkin", authenticateUser, async (req, res) => {
   try {
      const user = (req as any).user as AuthUser;
      const userId = user.id;

      const lat = parseNumberStrict(req.body.latitude);
      const lng = parseNumberStrict(req.body.longitude);
      const officeId = parseIntStrict(req.body.officeId);

      // accuracy hanya catatan, tidak memblok
      const accuracy = parseNumberStrict(req.body.accuracy_m);

      if (lat === null || lng === null || officeId === null) {
         return res.status(400).json({
            error: "Missing required fields: latitude, longitude, officeId",
         });
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
         return res.status(400).json({ error: "Invalid coordinates" });
      }

      const office = await getOfficeOr404(officeId);
      if (!office) return res.status(404).json({ error: "Office not found" });

      // RULE SATU-SATUNYA: harus di dalam radius kantor (DB)
      const geo = checkGeofence(
         lat,
         lng,
         office.latitude,
         office.longitude,
         office.radius_meters
      );
      if (geo.status === "FAIL") {
         return res.status(403).json({
            error: "Anda berada di luar radius kantor",
            distance_to_office_m: geo.distance,
            office_radius_m: office.radius_meters,
         });
      }

      // Cegah checkin dobel hari yang sama (tanpa checkout)
      const today = getCurrentDate();
      const existingCheckin = await db.get<AttendanceRecord>(
         `SELECT * FROM attendance_records
       WHERE user_id = ?
         AND DATE(timestamp) = ?
         AND type = 'checkin'
         AND NOT EXISTS (
           SELECT 1 FROM attendance_records ar2
           WHERE ar2.user_id = attendance_records.user_id
             AND DATE(ar2.timestamp) = DATE(attendance_records.timestamp)
             AND ar2.type = 'checkout'
             AND ar2.timestamp > attendance_records.timestamp
         )`,
         [userId, today]
      );

      if (existingCheckin) {
         return res.status(400).json({
            error: "Anda sudah check-in hari ini. Silakan check-out dulu.",
         });
      }

      const timestamp = getCurrentTimestamp();
      const ip = getClientIp(req);
      const ua = req.get("User-Agent") || "unknown";

      const r = await db.run(
         `INSERT INTO attendance_records
       (user_id, office_id, type, timestamp, latitude, longitude, distance_to_office_m, geofence_status, wifi_status, ip_address, user_agent, notes)
       VALUES (?, ?, 'checkin', ?, ?, ?, ?, ?, 'NOT_CHECKED', ?, ?, ?)`,
         [
            userId,
            officeId,
            timestamp,
            lat,
            lng,
            geo.distance,
            geo.status,
            ip,
            ua,
            accuracy !== null ? `accuracy_m=${accuracy}` : null,
         ]
      );

      return res.json({
         success: true,
         message: "Check-in successful",
         data: {
            id: r.lastID,
            type: "checkin",
            timestamp,
            distance_to_office_m: geo.distance,
            office_radius_m: office.radius_meters,
            accuracy_m: accuracy,
         },
      });
   } catch (e) {
      console.error("Error during check-in:", e);
      return res.status(500).json({ error: "Internal server error" });
   }
});

// =====================
// CHECK-OUT (STRICT)
// =====================
router.post("/checkout", authenticateUser, async (req, res) => {
   try {
      const user = (req as any).user as AuthUser;
      const userId = user.id;

      const lat = parseNumberStrict(req.body.latitude);
      const lng = parseNumberStrict(req.body.longitude);
      const officeId = parseIntStrict(req.body.officeId);

      // accuracy hanya catatan, tidak memblok
      const accuracy = parseNumberStrict(req.body.accuracy_m);

      if (lat === null || lng === null || officeId === null) {
         return res.status(400).json({
            error: "Missing required fields: latitude, longitude, officeId",
         });
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
         return res.status(400).json({ error: "Invalid coordinates" });
      }

      const office = await getOfficeOr404(officeId);
      if (!office) return res.status(404).json({ error: "Office not found" });

      // RULE SATU-SATUNYA: harus di dalam radius kantor (DB)
      const geo = checkGeofence(
         lat,
         lng,
         office.latitude,
         office.longitude,
         office.radius_meters
      );
      if (geo.status === "FAIL") {
         return res.status(403).json({
            error: "Anda berada di luar radius kantor",
            distance_to_office_m: geo.distance,
            office_radius_m: office.radius_meters,
         });
      }

      // Harus ada checkin aktif hari ini
      const today = getCurrentDate();
      const activeCheckin = await db.get<AttendanceRecord>(
         `SELECT * FROM attendance_records
       WHERE user_id = ?
         AND DATE(timestamp) = ?
         AND type = 'checkin'
         AND NOT EXISTS (
           SELECT 1 FROM attendance_records ar2
           WHERE ar2.user_id = attendance_records.user_id
             AND DATE(ar2.timestamp) = DATE(attendance_records.timestamp)
             AND ar2.type = 'checkout'
             AND ar2.timestamp > attendance_records.timestamp
         )`,
         [userId, today]
      );

      if (!activeCheckin) {
         return res.status(400).json({
            error: "Tidak ada check-in aktif hari ini. Silakan check-in dulu.",
         });
      }

      const timestamp = getCurrentTimestamp();
      const ip = getClientIp(req);
      const ua = req.get("User-Agent") || "unknown";

      const r = await db.run(
         `INSERT INTO attendance_records
       (user_id, office_id, type, timestamp, latitude, longitude, distance_to_office_m, geofence_status, wifi_status, ip_address, user_agent, notes)
       VALUES (?, ?, 'checkout', ?, ?, ?, ?, ?, 'NOT_CHECKED', ?, ?, ?)`,
         [
            userId,
            officeId,
            timestamp,
            lat,
            lng,
            geo.distance,
            geo.status,
            ip,
            ua,
            accuracy !== null ? `accuracy_m=${accuracy}` : null,
         ]
      );

      return res.json({
         success: true,
         message: "Check-out successful",
         data: {
            id: r.lastID,
            type: "checkout",
            timestamp,
            distance_to_office_m: geo.distance,
            office_radius_m: office.radius_meters,
            accuracy_m: accuracy,
         },
      });
   } catch (e) {
      console.error("Error during check-out:", e);
      return res.status(500).json({ error: "Internal server error" });
   }
});

export default router;
