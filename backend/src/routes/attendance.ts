import express, { Request, Response, NextFunction } from "express";
import { db, AttendanceRecord, Office } from "../database";
import {
   checkGeofence,
   isIPInOfficeNetwork,
   getCurrentTimestamp,
   getCurrentDate,
   normalizeIp,
} from "../utils";

const router = express.Router();

// Demo auth: user-id header
const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
   const userIdRaw = req.headers["user-id"] as string;
   const userId = Number(userIdRaw);
   if (!userId || Number.isNaN(userId))
      return res.status(401).json({ error: "Authentication required" });
   (req as any).userId = userId;
   next();
};

function parseNumberStrict(v: any): number | null {
   const n = typeof v === "number" ? v : Number(v);
   if (!Number.isFinite(n)) return null;
   return n;
}

// ambil IP real (x-forwarded-for / req.ip)
function getClientIp(req: Request): string {
   const xf = req.headers["x-forwarded-for"] as string | undefined;
   if (xf) return normalizeIp(xf);
   return normalizeIp(req.ip);
}

// Get office information
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

// Internal validator for both checkin/checkout
async function validateRequest(
   req: Request,
   officeId: number,
   lat: number,
   lng: number
) {
   const office = await db.get<Office>("SELECT * FROM offices WHERE id = ?", [
      officeId,
   ]);
   if (!office) {
      return {
         ok: false as const,
         status: 404,
         body: { error: "Office not found" },
      };
   }

   // geofence
   const geo = checkGeofence(
      lat,
      lng,
      office.latitude,
      office.longitude,
      office.radius_meters
   );
   if (geo.status === "FAIL") {
      return {
         ok: false as const,
         status: 403,
         body: {
            error: "Anda berada di luar area kantor",
            distance: geo.distance,
            geofence_status: geo.status,
         },
      };
   }

   // network whitelist (WiFi kantor versi web)
   const networks = await db.all<{ cidr: string }>(
      "SELECT cidr FROM office_networks WHERE office_id = ?",
      [officeId]
   );
   const cidrs = networks.map((n) => n.cidr);

   const clientIP = getClientIp(req);

   // jika whitelist kosong => FAIL (biar tidak jadi bebas)
   const networkPass = cidrs.length > 0 && isIPInOfficeNetwork(clientIP, cidrs);
   if (!networkPass) {
      return {
         ok: false as const,
         status: 403,
         body: {
            error: "Anda tidak menggunakan jaringan kantor (WiFi kantor)",
            wifi_status: "FAIL",
            ip_address: clientIP,
         },
      };
   }

   return {
      ok: true as const,
      office,
      geo,
      clientIP,
      wifi_status: "PASS" as const,
      userAgent: req.get("User-Agent") || "unknown",
   };
}

// Check-in
router.post("/checkin", authenticateUser, async (req, res) => {
   try {
      const userId = (req as any).userId as number;

      const lat = parseNumberStrict(req.body.latitude);
      const lng = parseNumberStrict(req.body.longitude);
      const officeId = parseNumberStrict(req.body.officeId);
      const accuracy = parseNumberStrict(req.body.accuracy_m);

      if (lat === null || lng === null || officeId === null) {
         return res
            .status(400)
            .json({
               error: "Missing required fields: latitude, longitude, officeId",
            });
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
         return res.status(400).json({ error: "Invalid coordinates" });
      }

      // optional: reject akurasi jelek
      if (accuracy !== null && accuracy > 80) {
         return res
            .status(400)
            .json({
               error: "Akurasi GPS terlalu rendah (>80m). Coba refresh lokasi.",
            });
      }

      const validated = await validateRequest(req, officeId, lat, lng);
      if (!validated.ok)
         return res.status(validated.status).json(validated.body);

      // Cegah checkin dobel di hari yang sama (tanpa checkout)
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
         return res
            .status(400)
            .json({
               error: "Anda sudah check-in hari ini. Silakan check-out dulu.",
            });
      }

      const timestamp = getCurrentTimestamp();
      const r = await db.run(
         `INSERT INTO attendance_records
       (user_id, office_id, type, timestamp, latitude, longitude,
        distance_to_office_m, geofence_status, wifi_status, ip_address, user_agent, notes)
       VALUES (?, ?, 'checkin', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [
            userId,
            officeId,
            timestamp,
            lat,
            lng,
            validated.geo.distance,
            validated.geo.status,
            validated.wifi_status, // PASS = jaringan kantor valid
            validated.clientIP,
            validated.userAgent,
            accuracy !== null ? `accuracy_m=${accuracy}` : null,
         ]
      );

      res.json({
         success: true,
         message: "Check-in successful",
         data: {
            id: r.lastID,
            type: "checkin",
            timestamp,
            latitude: lat,
            longitude: lng,
            distance_to_office_m: validated.geo.distance,
            geofence_status: validated.geo.status,
            wifi_status: validated.wifi_status,
            ip_address: validated.clientIP,
            office_name: validated.office.name,
         },
      });
   } catch (error) {
      console.error("Error during check-in:", error);
      res.status(500).json({ error: "Internal server error" });
   }
});

// Check-out
router.post("/checkout", authenticateUser, async (req, res) => {
   try {
      const userId = (req as any).userId as number;

      const lat = parseNumberStrict(req.body.latitude);
      const lng = parseNumberStrict(req.body.longitude);
      const officeId = parseNumberStrict(req.body.officeId);
      const accuracy = parseNumberStrict(req.body.accuracy_m);

      if (lat === null || lng === null || officeId === null) {
         return res
            .status(400)
            .json({
               error: "Missing required fields: latitude, longitude, officeId",
            });
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
         return res.status(400).json({ error: "Invalid coordinates" });
      }

      if (accuracy !== null && accuracy > 80) {
         return res
            .status(400)
            .json({
               error: "Akurasi GPS terlalu rendah (>80m). Coba refresh lokasi.",
            });
      }

      const validated = await validateRequest(req, officeId, lat, lng);
      if (!validated.ok)
         return res.status(validated.status).json(validated.body);

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
         return res
            .status(400)
            .json({
               error: "Tidak ada check-in aktif hari ini. Silakan check-in dulu.",
            });
      }

      const timestamp = getCurrentTimestamp();
      const r = await db.run(
         `INSERT INTO attendance_records
       (user_id, office_id, type, timestamp, latitude, longitude,
        distance_to_office_m, geofence_status, wifi_status, ip_address, user_agent, notes)
       VALUES (?, ?, 'checkout', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [
            userId,
            officeId,
            timestamp,
            lat,
            lng,
            validated.geo.distance,
            validated.geo.status,
            validated.wifi_status,
            validated.clientIP,
            validated.userAgent,
            accuracy !== null ? `accuracy_m=${accuracy}` : null,
         ]
      );

      res.json({
         success: true,
         message: "Check-out successful",
         data: {
            id: r.lastID,
            type: "checkout",
            timestamp,
            latitude: lat,
            longitude: lng,
            distance_to_office_m: validated.geo.distance,
            geofence_status: validated.geo.status,
            wifi_status: validated.wifi_status,
            ip_address: validated.clientIP,
            office_name: validated.office.name,
         },
      });
   } catch (error) {
      console.error("Error during check-out:", error);
      res.status(500).json({ error: "Internal server error" });
   }
});

// Get user's attendance records
router.get("/records", authenticateUser, async (req, res) => {
   try {
      const userId = (req as any).userId as number;
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

// Get attendance summary for user
router.get("/summary", authenticateUser, async (req, res) => {
   try {
      const userId = (req as any).userId as number;
      const { month, year } = req.query;

      const currentDate = new Date();
      const targetMonth = month
         ? parseInt(month as string)
         : currentDate.getMonth() + 1;
      const targetYear = year
         ? parseInt(year as string)
         : currentDate.getFullYear();

      const summary = await db.all(
         `SELECT
        DATE(timestamp) as date,
        COUNT(CASE WHEN type = 'checkin' THEN 1 END) as checkins,
        COUNT(CASE WHEN type = 'checkout' THEN 1 END) as checkouts,
        MIN(CASE WHEN type = 'checkin' THEN timestamp END) as first_checkin,
        MAX(CASE WHEN type = 'checkout' THEN timestamp END) as last_checkout
       FROM attendance_records
       WHERE user_id = ?
       AND strftime('%m', timestamp) = ?
       AND strftime('%Y', timestamp) = ?
       GROUP BY DATE(timestamp)
       ORDER BY date DESC`,
         [
            userId,
            targetMonth.toString().padStart(2, "0"),
            targetYear.toString(),
         ]
      );

      res.json({
         success: true,
         data: { month: targetMonth, year: targetYear, summary },
      });
   } catch (error) {
      console.error("Error fetching attendance summary:", error);
      res.status(500).json({ error: "Internal server error" });
   }
});

export default router;
