import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AttendanceForm.css';

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

/**
 * API base:
 * - Local dev di laptop: http://localhost:3001
 * - Kalau akses FE dari HP via http://IP_LAPTOP:3000 => API jadi http://IP_LAPTOP:3001
 * Bisa override via env: REACT_APP_API_BASE
 */
const API_BASE =
  (process.env.REACT_APP_API_BASE as string) ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : `http://${window.location.hostname}:3001`);

const AttendanceForm: React.FC<AttendanceFormProps> = ({ offices, userId }) => {
  const [selectedOffice, setSelectedOffice] = useState<number>(offices[0]?.id || 0);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastAttendance, setLastAttendance] = useState<any>(null);

  const selectedOfficeData = useMemo(
    () => offices.find((office) => office.id === selectedOffice),
    [offices, selectedOffice]
  );

  useEffect(() => {
    // set default office ketika offices baru masuk
    if ((!selectedOffice || selectedOffice === 0) && offices[0]?.id) {
      setSelectedOffice(offices[0].id);
    }
  }, [offices, selectedOffice]);

  useEffect(() => {
    refreshLocation();
    loadLastAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const getLocationOnce = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation tidak didukung oleh browser ini'));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  const refreshLocation = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const loc = await getLocationOnce();
      setCurrentLocation({ lat: loc.lat, lng: loc.lng });
      setLocationAccuracy(loc.accuracy);
    } catch (error: any) {
      let errorMessage = 'Tidak dapat mendapatkan lokasi';
      if (error?.code === 1) errorMessage = 'Akses lokasi ditolak. Izinkan akses lokasi untuk absensi.';
      if (error?.code === 2) errorMessage = 'Informasi lokasi tidak tersedia';
      if (error?.code === 3) errorMessage = 'Waktu permintaan lokasi habis';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const loadLastAttendance = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/attendance/records?limit=1`, {
        headers: { 'user-id': userId.toString() },
      });

      if (response.data?.success && Array.isArray(response.data.data) && response.data.data.length > 0) {
        setLastAttendance(response.data.data[0]);
      } else {
        setLastAttendance(null);
      }
    } catch (error) {
      console.error('Error loading last attendance:', error);
    }
  };

  const handleAttendance = async (type: 'checkin' | 'checkout') => {
    if (!selectedOffice || selectedOffice === 0) {
      setMessage({ type: 'error', text: 'Pilih kantor terlebih dahulu' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // ambil lokasi TERBARU saat submit
      const loc = await getLocationOnce();
      setCurrentLocation({ lat: loc.lat, lng: loc.lng });
      setLocationAccuracy(loc.accuracy);

      const response = await axios.post(
        `${API_BASE}/api/attendance/${type}`,
        {
          latitude: loc.lat,
          longitude: loc.lng,
          accuracy_m: loc.accuracy,
          officeId: selectedOffice,
        },
        {
          headers: { 'user-id': userId.toString() },
        }
      );

      if (response.data?.success) {
        setMessage({
          type: 'success',
          text: `${type === 'checkin' ? 'Check-in' : 'Check-out'} berhasil!`,
        });
        await loadLastAttendance();
      } else {
        setMessage({ type: 'error', text: 'Respon server tidak valid' });
      }
    } catch (error: any) {
      const data = error?.response?.data;
      const errorMessage = data?.error || 'Terjadi kesalahan saat absensi';
      const detail = [
        data?.distance != null ? `Jarak: ${Math.round(data.distance)}m` : null,
        data?.ip_address ? `IP: ${data.ip_address}` : null,
        data?.geofence_status ? `Geo: ${data.geofence_status}` : null,
        data?.wifi_status ? `WiFi/Jaringan: ${data.wifi_status}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      setMessage({ type: 'error', text: detail ? `${errorMessage} (${detail})` : errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="attendance-form">
      <h2>Absensi Harian</h2>

      <div className="location-info">
        <h3>Informasi Lokasi</h3>
        {currentLocation ? (
          <div className="location-details">
            <p>
              <strong>Koordinat:</strong> {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            </p>
            {locationAccuracy != null && (
              <p>
                <strong>Akurasi:</strong> ±{Math.round(locationAccuracy)} meter
              </p>
            )}
            <button onClick={refreshLocation} className="refresh-location-btn" disabled={isLoading}>
              {isLoading ? 'Memproses...' : 'Refresh Lokasi'}
            </button>
          </div>
        ) : (
          <div className="location-loading">{isLoading ? 'Mendapatkan lokasi...' : 'Lokasi belum didapatkan'}</div>
        )}
      </div>

      <div className="office-selection">
        <label htmlFor="office-select">Pilih Kantor:</label>
        <select
          id="office-select"
          value={selectedOffice}
          onChange={(e) => setSelectedOffice(parseInt(e.target.value, 10))}
          disabled={offices.length === 0}
        >
          {offices.length === 0 ? (
            <option value={0}>Memuat kantor...</option>
          ) : (
            offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name} - Radius: {office.radius_meters}m
              </option>
            ))
          )}
        </select>

        {selectedOfficeData && (
          <div className="office-details">
            <p>
              <strong>Alamat:</strong> {selectedOfficeData.address}
            </p>
            <p>
              <strong>Koordinat Kantor:</strong> {selectedOfficeData.latitude.toFixed(6)},{' '}
              {selectedOfficeData.longitude.toFixed(6)}
            </p>
          </div>
        )}
      </div>

      <div className="attendance-actions">
        <button onClick={() => handleAttendance('checkin')} disabled={isLoading} className="checkin-btn">
          {isLoading ? 'Memproses...' : 'Check-In'}
        </button>

        <button onClick={() => handleAttendance('checkout')} disabled={isLoading} className="checkout-btn">
          {isLoading ? 'Memproses...' : 'Check-Out'}
        </button>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {lastAttendance && (
        <div className="last-attendance">
          <h3>Status Absensi Terakhir</h3>
          <p>
            <strong>Jenis:</strong> {lastAttendance.type === 'checkin' ? 'Check-in' : 'Check-out'}
          </p>
          <p>
            <strong>Waktu:</strong> {new Date(lastAttendance.timestamp).toLocaleString('id-ID')}
          </p>
          <p>
            <strong>Jarak ke Kantor:</strong> {Math.round(lastAttendance.distance_to_office_m)} meter
          </p>
          <p>
            <strong>Geofence:</strong>{' '}
            <span className={lastAttendance.geofence_status === 'PASS' ? 'status-pass' : 'status-fail'}>
              {lastAttendance.geofence_status}
            </span>
          </p>
          <p>
            <strong>WiFi/Jaringan:</strong>{' '}
            <span className={lastAttendance.wifi_status === 'PASS' ? 'status-pass' : 'status-fail'}>
              {lastAttendance.wifi_status}
            </span>
          </p>
        </div>
      )}

      <div className="security-notice">
        <h4>⚠️ Aturan Validasi</h4>
        <ul>
          <li>
            Absensi hanya diterima jika <b>dalam radius kantor</b> (Geofence PASS)
          </li>
          <li>
            Absensi hanya diterima jika <b>menggunakan jaringan kantor</b> (WiFi/Jaringan PASS)
          </li>
          <li>Website tidak bisa membaca SSID/BSSID secara aman; validasi WiFi dilakukan via IP/CIDR whitelist</li>
          <li>Jika akurasi GPS terlalu buruk, sistem menolak</li>
        </ul>
      </div>
    </div>
  );
};

export default AttendanceForm;
