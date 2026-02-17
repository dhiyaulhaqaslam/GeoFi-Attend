import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./AttendanceForm.css";
import LocationMap from "./LocationMap";

interface Office {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  address: string;
}

interface AttendanceFormProps {
  offices: Office[];
  userId: number;
}

type BestLoc = { lat: number; lng: number; accuracy: number; timestamp: number };

// ===== util: haversine (meter) =====
function toRad(v: number) {
  return (v * Math.PI) / 180;
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatMeters(m: number) {
  if (!Number.isFinite(m)) return "-";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

const AttendanceForm: React.FC<AttendanceFormProps> = ({ offices, userId }) => {
  const [selectedOffice, setSelectedOffice] = useState<number>(0);
  const [loc, setLoc] = useState<BestLoc | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastAttendance, setLastAttendance] = useState<any>(null);

  const [showOfficePoint, setShowOfficePoint] = useState(false);

  // camera
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  // face enrollment status (null = loading, true/false = enrolled or not)
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [enrollLoading, setEnrollLoading] = useState(false);

  useEffect(() => {
    if (!selectedOffice && offices.length > 0) setSelectedOffice(offices[0].id);
  }, [offices, selectedOffice]);

  const selectedOfficeData = useMemo(
    () => offices.find((o) => o.id === selectedOffice),
    [offices, selectedOffice]
  );

  // ===== location sampling =====
  const getBestLocation = (samples = 5): Promise<BestLoc> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation tidak didukung"));

      let best: BestLoc | null = null;
      let count = 0;

      const tryOnce = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const cur: BestLoc = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            };

            if (!best || cur.accuracy < best.accuracy) best = cur;

            count++;
            if (count >= samples) {
              if (!best) return reject(new Error("Tidak bisa ambil lokasi"));
              return resolve(best);
            }
            setTimeout(tryOnce, 700);
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      };

      tryOnce();
    });
  };

  const humanGeoError = (error: any) => {
    let errorMessage = "Tidak bisa mendapatkan lokasi";
    if (error?.code === 1) errorMessage = "Akses lokasi ditolak. Izinkan akses lokasi untuk absensi.";
    if (error?.code === 2) errorMessage = "Lokasi tidak tersedia (GPS/jaringan bermasalah).";
    if (error?.code === 3) errorMessage = "Waktu mengambil lokasi habis. Coba lagi.";
    return errorMessage;
  };

  const refreshLocation = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const best = await getBestLocation(7);
      setLoc(best);
    } catch (e: any) {
      setMessage({ type: "error", text: humanGeoError(e) });
    } finally {
      setIsLoading(false);
    }
  };

  const loadLastAttendance = async () => {
    try {
      const response = await axios.get(`/api/attendance/records?limit=1`, {
        headers: { "user-id": userId.toString() },
      });

      if (response.data.success && response.data.data.length > 0) {
        setLastAttendance(response.data.data[0]);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || "Tidak bisa terhubung ke server";
      console.error("Error loading last attendance:", msg);
    }
  };

  const loadFaceStatus = async () => {
    try {
      const res = await axios.get("/api/attendance/face/status", {
        headers: { "user-id": userId.toString() },
      });
      setFaceEnrolled(Boolean(res.data?.enrolled));
    } catch {
      setFaceEnrolled(false);
    }
  };

  useEffect(() => {
    refreshLocation();
    loadLastAttendance();
    loadFaceStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const distanceToOffice = useMemo(() => {
    if (!loc || !selectedOfficeData) return null;
    return distanceMeters(loc.lat, loc.lng, selectedOfficeData.latitude, selectedOfficeData.longitude);
  }, [loc, selectedOfficeData]);

  const withinRadius = useMemo(() => {
    if (distanceToOffice === null || !selectedOfficeData) return false;
    return distanceToOffice <= (selectedOfficeData.radius_meters ?? 20);
  }, [distanceToOffice, selectedOfficeData]);

  const canAttemptAttendance = Boolean(loc && selectedOfficeData && withinRadius);

  // ===== camera functions =====
  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch (e: any) {
      setCamError(e?.message || "Tidak bisa akses kamera");
      setCamOn(false);
    }
  };

  const stopCamera = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setCamOn(false);
  };

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureFaceImageBase64 = (): string | null => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return null;
    if (v.videoWidth === 0 || v.videoHeight === 0) return null;

    // crop center square
    const size = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;

    c.width = 480;
    c.height = 480;

    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, sx, sy, size, size, 0, 0, c.width, c.height);

    return c.toDataURL("image/jpeg", 0.9);
  };

  // ===== face enrollment =====
  const handleEnrollFace = async () => {
    if (!camOn) {
      setMessage({ type: "error", text: "Aktifkan kamera terlebih dahulu, lalu klik Daftar Wajah lagi." });
      return;
    }
    const faceImage = captureFaceImageBase64();
    if (!faceImage) {
      setMessage({ type: "error", text: "Gagal mengambil gambar. Pastikan wajah terlihat di kamera." });
      return;
    }
    setEnrollLoading(true);
    setMessage(null);
    try {
      await axios.post(
        "/api/attendance/face/enroll",
        { image_base64: faceImage },
        { headers: { "user-id": userId.toString() } }
      );
      setMessage({ type: "success", text: "Wajah berhasil didaftarkan. Sekarang Anda bisa check-in/check-out." });
      loadFaceStatus();
    } catch (error: any) {
      const raw = error?.response?.data?.error || error?.message || "Gagal mendaftarkan wajah.";
      let errMsg = raw;
      const r = String(raw).toLowerCase();
      if (r.includes("fetch failed") || r.includes("tidak dapat dihubungi") || r.includes("network error") || r.includes("failed to fetch")) {
        errMsg = "Layanan wajah tidak dapat dihubungi. Pastikan Face Service (Python) berjalan di port 8001. Lihat HOW_TO_RUN.md.";
      } else if (r.includes("no face detected") || r.includes("wajah tidak terdeteksi")) {
        errMsg = "Wajah tidak terdeteksi. Pastikan wajah Anda terlihat jelas di dalam frame kamera, lalu coba lagi.";
      } else if (String(raw).toLowerCase().includes("invalid image") || String(raw).toLowerCase().includes("empty image")) {
        errMsg = "Gambar tidak valid. Aktifkan kamera, pastikan wajah terlihat, lalu klik Daftar Wajah lagi.";
      }
      setMessage({ type: "error", text: errMsg });
    } finally {
      setEnrollLoading(false);
    }
  };

  // ===== submit attendance =====
  const handleAttendance = async (type: "checkin" | "checkout") => {
    if (!selectedOfficeData) {
      setMessage({ type: "error", text: "Pilih kantor terlebih dahulu." });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const best = await getBestLocation(7);
      setLoc(best);

      if (!camOn) {
        setMessage({ type: "error", text: "Kamera belum aktif. Aktifkan kamera untuk verifikasi wajah." });
        return;
      }

      const faceImage = captureFaceImageBase64();
      if (!faceImage) {
        setMessage({ type: "error", text: "Gagal mengambil gambar wajah. Pastikan kamera menampilkan video." });
        return;
      }

      const response = await axios.post(
        `/api/attendance/${type}`,
        {
          latitude: best.lat,
          longitude: best.lng,
          accuracy_m: best.accuracy,
          officeId: selectedOfficeData.id,

          // ✅ INI YANG KAMU LUPA:
          face_image_base64: faceImage,
        },
        { headers: { "user-id": userId.toString() } }
      );

      if (response.data.success) {
        setMessage({
          type: "success",
          text: `${type === "checkin" ? "Check-in" : "Check-out"} berhasil.`,
        });
        loadLastAttendance();
      }
    } catch (error: any) {
      const data = error?.response?.data;
      const status = error?.response?.status;
      let errorMessage = data?.error || error?.message || "Tidak bisa terhubung ke server.";

      if (status === 503 || String(errorMessage).toLowerCase().includes("tidak dapat dihubungi")) {
        setMessage({
          type: "error",
          text: "Layanan wajah tidak dapat dihubungi. Pastikan Face Service (Python) berjalan di port 8001. Lihat HOW_TO_RUN.md.",
        });
        return;
      }

      if (String(errorMessage).toLowerCase().includes("di luar radius")) {
        const d = data?.distance_to_office_m;
        const r = data?.office_radius_m;
        setMessage({
          type: "error",
          text: `Anda belum berada di area kantor. Jarak Anda ${d ? formatMeters(d) : "-"} (maks ${r ?? "-"} m).`,
        });
        return;
      }

      // face fail user-friendly
      if (String(errorMessage).toLowerCase().includes("wajah")) {
        loadFaceStatus(); // refresh status so "Daftar Wajah" is visible if not enrolled
        const fd = data?.face_distance;
        const thr = data?.threshold;
        setMessage({
          type: "error",
          text: `${errorMessage}${fd != null ? ` (distance=${fd})` : ""}${thr != null ? ` threshold=${thr}` : ""}`,
        });
        return;
      }

      setMessage({ type: "error", text: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="attendance-form">
      <h2>Absensi Harian</h2>

      {/* ===== FACE CAMERA & ENROLL ===== */}
      <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Verifikasi Wajah</div>

        {faceEnrolled === false && (
          <div
            className="message error"
            style={{ marginBottom: 10, background: "#fef2f2", border: "1px solid #fecaca" }}
          >
            Wajah belum didaftarkan. Silakan aktifkan kamera lalu klik <strong>Daftar Wajah</strong> di bawah agar bisa absen.
          </div>
        )}
        {faceEnrolled === true && (
          <div style={{ marginBottom: 8, fontSize: 14, color: "#059669", fontWeight: 600 }}>
            ✓ Wajah sudah didaftarkan
          </div>
        )}

        {!camOn ? (
          <button type="button" onClick={startCamera} className="refresh-location-btn">
            Aktifkan Kamera
          </button>
        ) : (
          <button type="button" onClick={stopCamera} className="refresh-location-btn">
            Matikan Kamera
          </button>
        )}

        {camOn && (
          <button
            type="button"
            onClick={handleEnrollFace}
            disabled={enrollLoading}
            className="refresh-location-btn"
            style={{ marginLeft: 8, background: "#0891b2", color: "white", border: "none" }}
          >
            {enrollLoading ? "Mendaftarkan..." : "Daftar Wajah"}
          </button>
        )}

        {camError && (
          <div className="message error" style={{ marginTop: 8 }}>
            {camError}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: 320, height: 240, background: "#111", borderRadius: 8 }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
          {faceEnrolled ? "Pastikan wajah terlihat jelas sebelum klik Check-In/Out." : "Daftar wajah sekali, lalu gunakan untuk check-in/check-out."}
        </div>
      </div>

      {/* ===== STATUS UTAMA ===== */}
      <div
        style={{
          borderRadius: 10,
          padding: 12,
          border: "1px solid #e5e7eb",
          marginBottom: 12,
          background: canAttemptAttendance ? "#ecfdf5" : "#fef2f2",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          {canAttemptAttendance ? "✅ Anda sudah berada di area kantor" : "⚠️ Belum bisa absen"}
        </div>

        <div style={{ fontSize: 14, opacity: 0.9 }}>
          {selectedOfficeData ? (
            <>
              {distanceToOffice !== null ? (
                <>
                  Jarak Anda ke kantor: <strong>{formatMeters(distanceToOffice)}</strong>.{" "}
                  Batas absen: <strong>≤ {selectedOfficeData.radius_meters} m</strong>.
                </>
              ) : (
                <>Tekan Refresh Lokasi untuk cek jarak Anda ke kantor.</>
              )}

              {loc && (
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                  (Info GPS: perkiraan akurasi {Math.round(loc.accuracy)} m)
                </div>
              )}
            </>
          ) : (
            "Pilih kantor terlebih dahulu."
          )}
        </div>

        <button
          onClick={refreshLocation}
          disabled={isLoading}
          className="refresh-location-btn"
          style={{ marginTop: 10 }}
        >
          {isLoading ? "Memproses..." : "Refresh Lokasi"}
        </button>
      </div>

      {/* ===== PILIH KANTOR ===== */}
      <div className="office-selection">
        <label htmlFor="office-select" style={{ fontWeight: 600 }}>
          Pilih Kantor
        </label>

        <select
          id="office-select"
          value={selectedOffice}
          onChange={(e) => setSelectedOffice(parseInt(e.target.value, 10))}
          disabled={offices.length === 0}
          style={{ marginTop: 6 }}
        >
          {offices.length === 0 ? (
            <option value={0}>Tidak ada kantor</option>
          ) : (
            offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name} — Radius: {office.radius_meters} m
              </option>
            ))
          )}
        </select>

        {selectedOfficeData && (
          <div className="office-details" style={{ marginTop: 10 }}>
            <div>
              <strong>Alamat kantor:</strong> {selectedOfficeData.address || selectedOfficeData.name}
            </div>
            <div style={{ marginTop: 6 }}>
              <strong>Batas absen:</strong> ≤ {selectedOfficeData.radius_meters} m
            </div>

            <button
              type="button"
              onClick={() => setShowOfficePoint((v) => !v)}
              style={{
                marginTop: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "8px 10px",
                background: "white",
                cursor: "pointer",
                width: "fit-content",
              }}
            >
              {showOfficePoint ? "Sembunyikan titik kantor" : "Lihat titik kantor"}
            </button>

            {showOfficePoint && (
              <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 13 }}>
                Titik kantor: {selectedOfficeData.latitude}, {selectedOfficeData.longitude}
              </div>
            )}
          </div>
        )}

        {selectedOfficeData && (
          <LocationMap
            office={{
              name: selectedOfficeData.name,
              latitude: selectedOfficeData.latitude,
              longitude: selectedOfficeData.longitude,
              radius_meters: selectedOfficeData.radius_meters ?? 20,
              address: selectedOfficeData.address,
            }}
            userLoc={loc}
          />
        )}
      </div>

      {/* ===== AKSI ABSEN ===== */}
      <div className="attendance-actions" style={{ marginTop: 14 }}>
        <button
          onClick={() => handleAttendance("checkin")}
          disabled={isLoading || offices.length === 0}
          className="checkin-btn"
        >
          {isLoading ? "Memproses..." : "Check-In"}
        </button>

        <button
          onClick={() => handleAttendance("checkout")}
          disabled={isLoading || offices.length === 0}
          className="checkout-btn"
        >
          {isLoading ? "Memproses..." : "Check-Out"}
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`} style={{ marginTop: 12 }}>
          {message.text}
        </div>
      )}

      {lastAttendance && (
        <div className="last-attendance" style={{ marginTop: 14 }}>
          <h3>Status Terakhir</h3>
          <p>
            <strong>Jenis:</strong> {lastAttendance.type === "checkin" ? "Check-in" : "Check-out"}
          </p>
          <p>
            <strong>Waktu:</strong> {new Date(lastAttendance.timestamp).toLocaleString("id-ID")}
          </p>
          <p>
            <strong>Jarak ke kantor saat itu:</strong> {Math.round(lastAttendance.distance_to_office_m)} m
          </p>
        </div>
      )}
    </div>
  );
};

export default AttendanceForm;
