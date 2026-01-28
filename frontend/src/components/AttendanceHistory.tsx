import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AttendanceHistory.css';

interface AttendanceRecord {
  id: number;
  user_id: number;
  office_id: number;
  type: 'checkin' | 'checkout';
  timestamp: string;
  latitude: number;
  longitude: number;
  distance_to_office_m: number;
  geofence_status: 'PASS' | 'FAIL';
  wifi_ssid?: string;
  wifi_bssid?: string;
  wifi_status: 'PASS' | 'FAIL' | 'NOT_CHECKED';
  ip_address?: string;
  user_agent: string;
  notes?: string;
  office_name: string;
  user_name: string;
}

interface AttendanceHistoryProps {
  userId: number;
}

const API_BASE =
  (process.env.REACT_APP_API_BASE as string) ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : `http://${window.location.hostname}:3001`);

const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({ userId }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const recordsPerPage = 20;

  useEffect(() => {
    loadAttendanceRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentPage]);

  const loadAttendanceRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (currentPage - 1) * recordsPerPage;

      const response = await axios.get(
        `${API_BASE}/api/attendance/records?limit=${recordsPerPage}&offset=${offset}`,
        {
          headers: { 'user-id': userId.toString() },
        }
      );

      if (response.data?.success) {
        setRecords(response.data.data || []);
      } else {
        setRecords([]);
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Gagal memuat riwayat absensi';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const attendancePairs = useMemo(() => {
    const groupedByDate: { [key: string]: AttendanceRecord[] } = {};

    records.forEach((record) => {
      const dateKey = new Date(record.timestamp).toDateString();
      if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
      groupedByDate[dateKey].push(record);
    });

    const pairs: { date: string; checkin?: AttendanceRecord; checkout?: AttendanceRecord }[] = [];

    Object.keys(groupedByDate).forEach((date) => {
      const dayRecords = groupedByDate[date];
      const checkin = dayRecords.find((r) => r.type === 'checkin');
      const checkout = dayRecords.find((r) => r.type === 'checkout');
      pairs.push({ date, checkin, checkout });
    });

    return pairs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [records]);

  const calculateWorkHours = (checkin?: AttendanceRecord, checkout?: AttendanceRecord) => {
    if (!checkin || !checkout) return null;
    const checkinTime = new Date(checkin.timestamp).getTime();
    const checkoutTime = new Date(checkout.timestamp).getTime();
    const diffHours = (checkoutTime - checkinTime) / (1000 * 60 * 60);
    return diffHours.toFixed(2);
  };

  if (loading) return <div className="loading">Memuat riwayat absensi...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="attendance-history">
      <h2>Riwayat Absensi</h2>

      {attendancePairs.length === 0 ? (
        <div className="no-records">
          <p>Belum ada data absensi</p>
        </div>
      ) : (
        <>
          <div className="records-summary">
            <p>Menampilkan {records.length} record absensi</p>
          </div>

          <div className="records-table">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Durasi Kerja</th>
                  <th>Kantor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendancePairs.map((pair, index) => (
                  <tr key={index}>
                    <td>{formatDate(pair.date)}</td>
                    <td>
                      {pair.checkin ? (
                        <div className="time-info">
                          <div>{formatDateTime(pair.checkin.timestamp)}</div>
                          <div className="location">
                            📍 {pair.checkin.latitude.toFixed(4)}, {pair.checkin.longitude.toFixed(4)}
                          </div>
                          <div className="distance">Jarak: {pair.checkin.distance_to_office_m}m</div>
                        </div>
                      ) : (
                        <span className="missing">—</span>
                      )}
                    </td>
                    <td>
                      {pair.checkout ? (
                        <div className="time-info">
                          <div>{formatDateTime(pair.checkout.timestamp)}</div>
                          <div className="location">
                            📍 {pair.checkout.latitude.toFixed(4)}, {pair.checkout.longitude.toFixed(4)}
                          </div>
                          <div className="distance">Jarak: {pair.checkout.distance_to_office_m}m</div>
                        </div>
                      ) : (
                        <span className="missing">—</span>
                      )}
                    </td>
                    <td>
                      {calculateWorkHours(pair.checkin, pair.checkout) ? (
                        <span className="work-hours">{calculateWorkHours(pair.checkin, pair.checkout)} jam</span>
                      ) : (
                        <span className="missing">—</span>
                      )}
                    </td>
                    <td>{pair.checkin?.office_name || pair.checkout?.office_name || '—'}</td>
                    <td>
                      <div className="status-info">
                        {pair.checkin && (
                          <div>
                            <span className={`status ${pair.checkin.geofence_status.toLowerCase()}`}>
                              Geo: {pair.checkin.geofence_status}
                            </span>
                            <span className={`status ${pair.checkin.wifi_status.toLowerCase()}`}>
                              WiFi: {pair.checkin.wifi_status}
                            </span>
                          </div>
                        )}
                        {pair.checkout && (
                          <div>
                            <span className={`status ${pair.checkout.geofence_status.toLowerCase()}`}>
                              Geo: {pair.checkout.geofence_status}
                            </span>
                            <span className={`status ${pair.checkout.wifi_status.toLowerCase()}`}>
                              WiFi: {pair.checkout.wifi_status}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>
              Sebelumnya
            </button>
            <span>Halaman {currentPage}</span>
            <button onClick={() => setCurrentPage((prev) => prev + 1)} disabled={records.length < recordsPerPage}>
              Selanjutnya
            </button>
          </div>
        </>
      )}

      <div className="legend">
        <h4>Legenda Status:</h4>
        <div className="legend-items">
          <span className="status pass">PASS</span> = Valid
          <span className="status fail">FAIL</span> = Tidak Valid
          <span className="status not_checked">NOT_CHECKED</span> = Tidak Dicek
        </div>
      </div>
    </div>
  );
};

export default AttendanceHistory;
