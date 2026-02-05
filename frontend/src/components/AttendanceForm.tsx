import React, { useState, useEffect } from 'react';
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

const AttendanceForm: React.FC<AttendanceFormProps> = ({ offices, userId }) => {
  const [selectedOffice, setSelectedOffice] = useState<number>(0);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [lastAttendance, setLastAttendance] = useState<any>(null);

  useEffect(() => {
    // set default office ketika offices sudah ada
    if (!selectedOffice && offices.length > 0) {
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
            accuracy: pos.coords.accuracy
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
      const response = await axios.get(`/api/attendance/records?limit=1`, {
        headers: { 'user-id': userId.toString() }
      });

      if (response.data.success && response.data.data.length > 0) {
        setLastAttendance(response.data.data[0]);
      }
    } catch (error: any) {
      // tampilkan error yang lebih jelas
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        'Tidak bisa terhubung ke server';
      console.error('Error loading last attendance:', msg);
    }
  };

  const handleAttendance = async (type: 'checkin' | 'checkout') => {
    if (!selectedOffice) {
      setMessage({ type: 'error', text: 'Pilih kantor terlebih dahulu' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const loc = await getLocationOnce();
      setCurrentLocation({ lat: loc.lat, lng: loc.lng });
      setLocationAccuracy(loc.accuracy);

      const response = await axios.post(
        `/api/attendance/${type}`,
        {
          latitude: loc.lat,
          longitude: loc.lng,
          accuracy_m: loc.accuracy,
          officeId: selectedOffice
        },
        { headers: { 'user-id': userId.toString() } }
      );

      if (response.data.success) {
        setMessage({
          type: 'success',
          text: `${type === 'checkin' ? 'Check-in' : 'Check-out'} berhasil!`
        });
        loadLastAttendance();
      }
    } catch (error: any) {
      // kalau network error, error.response itu undefined
      const data = error?.response?.data;
      const errorMessage =
        data?.error ||
        error?.message ||
        'Tidak bisa terhubung ke server (cek port forward/proxy)';

      const detail = [
        data?.accuracy_m ? `Akurasi: ${Math.round(data.accuracy_m)}m` : null,
        data?.office_radius_m ? `Radius Kantor: ${data.office_radius_m}m` : null,
      ].filter(Boolean).join(' | ');


      setMessage({ type: 'error', text: detail ? `${errorMessage} (${detail})` : errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedOfficeData = offices.find(office => office.id === selectedOffice);

  return (
    <div className="attendance-form">
      <h2>Absensi Harian</h2>

      <div className="location-info">
        <h3>Informasi Lokasi</h3>
        {currentLocation ? (
          <div className="location-details">
            <p><strong>Koordinat:</strong> {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</p>
            {locationAccuracy !== null && (
              <p><strong>Akurasi:</strong> ±{Math.round(locationAccuracy)} meter</p>
            )}
            {selectedOfficeData && (
              <p>
                <strong>Radius Absensi:</strong> {selectedOfficeData.radius_meters} meter
              </p>
            )}

            <button onClick={refreshLocation} className="refresh-location-btn" disabled={isLoading}>
              {isLoading ? 'Memproses...' : 'Refresh Lokasi'}
            </button>
          </div>
        ) : (
          <div className="location-loading">
            {isLoading ? 'Mendapatkan lokasi...' : 'Lokasi belum didapatkan'}
          </div>
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
            <option value={0}>Tidak ada kantor</option>
          ) : (
            offices.map(office => (
              <option key={office.id} value={office.id}>
                {office.name} - Radius: {office.radius_meters}m
              </option>
            ))
          )}
        </select>

        {selectedOfficeData && (
          <div className="office-details">
            <p><strong>Alamat:</strong> {selectedOfficeData.address}</p>
            <p><strong>Koordinat Kantor:</strong> {selectedOfficeData.latitude.toFixed(6)}, {selectedOfficeData.longitude.toFixed(6)}</p>
          </div>
        )}
      </div>

      <div className="attendance-actions">
        <button onClick={() => handleAttendance('checkin')} disabled={isLoading || offices.length === 0} className="checkin-btn">
          {isLoading ? 'Memproses...' : 'Check-In'}
        </button>

        <button onClick={() => handleAttendance('checkout')} disabled={isLoading || offices.length === 0} className="checkout-btn">
          {isLoading ? 'Memproses...' : 'Check-Out'}
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {lastAttendance && (
        <div className="last-attendance">
          <h3>Status Absensi Terakhir</h3>
          <p><strong>Jenis:</strong> {lastAttendance.type === 'checkin' ? 'Check-in' : 'Check-out'}</p>
          <p><strong>Waktu:</strong> {new Date(lastAttendance.timestamp).toLocaleString('id-ID')}</p>
          <p><strong>Jarak ke Kantor:</strong> {Math.round(lastAttendance.distance_to_office_m)} meter</p>
        </div>
      )}
    </div>
  );
};

export default AttendanceForm;
