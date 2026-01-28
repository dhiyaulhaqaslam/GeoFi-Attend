import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AdminDashboard.css';

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

interface Office {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  address: string;
}

interface User {
  id: number;
  name: string;
  username: string;
  role: 'employee' | 'admin';
}

const API_BASE =
  (process.env.REACT_APP_API_BASE as string) ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : `http://${window.location.hostname}:3001`);

const AdminDashboard: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOffice, setSelectedOffice] = useState<number | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<number | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load offices
      const officesResponse = await axios.get(`${API_BASE}/api/attendance/offices`);
      setOffices(officesResponse.data || []);

      // Demo users
      const demoUsers: User[] = [
        { id: 1, name: 'Administrator', username: 'admin', role: 'admin' },
        { id: 2, name: 'Pegawai Satu', username: 'pegawai1', role: 'employee' },
      ];
      setUsers(demoUsers);

      // Load records for each user (demo)
      const allRecords: AttendanceRecord[] = [];
      for (const user of demoUsers) {
        try {
          const response = await axios.get(`${API_BASE}/api/attendance/records?limit=100`, {
            headers: { 'user-id': user.id.toString() },
          });
          if (response.data?.success) {
            allRecords.push(...(response.data.data || []));
          }
        } catch {
          // ignore per-user
        }
      }

      setRecords(
        allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      );
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Gagal memuat data dashboard';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (selectedOffice !== 'all' && record.office_id !== selectedOffice) return false;
      if (selectedUser !== 'all' && record.user_id !== selectedUser) return false;
      if (dateFilter && !record.timestamp.startsWith(dateFilter)) return false;
      return true;
    });
  }, [records, selectedOffice, selectedUser, dateFilter]);

  const getAttendanceSummary = () => {
    const summary: { [key: string]: { checkins: number; checkouts: number; users: Set<number> } } = {};

    filteredRecords.forEach((record) => {
      const date = new Date(record.timestamp).toISOString().split('T')[0];
      if (!summary[date]) summary[date] = { checkins: 0, checkouts: 0, users: new Set() };

      if (record.type === 'checkin') summary[date].checkins++;
      else summary[date].checkouts++;

      summary[date].users.add(record.user_id);
    });

    return Object.entries(summary).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30);
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Tanggal', 'Waktu', 'Nama', 'Jenis', 'Kantor', 'Koordinat', 'Jarak', 'Geofence', 'WiFi', 'IP'],
      ...filteredRecords.map((record) => [
        new Date(record.timestamp).toLocaleDateString('id-ID'),
        new Date(record.timestamp).toLocaleTimeString('id-ID'),
        record.user_name,
        record.type === 'checkin' ? 'Check-in' : 'Check-out',
        record.office_name,
        `${record.latitude}, ${record.longitude}`,
        record.distance_to_office_m,
        record.geofence_status,
        record.wifi_status,
        record.ip_address || '',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-absensi-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) return <div className="loading">Memuat dashboard admin...</div>;
  if (error) return <div className="error-message">{error}</div>;

  const summary = getAttendanceSummary();

  return (
    <div className="admin-dashboard">
      <h2>Dashboard Admin - Sistem Absensi</h2>

      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Total Records</h3>
          <div className="stat-number">{filteredRecords.length}</div>
        </div>
        <div className="stat-card">
          <h3>Total Users</h3>
          <div className="stat-number">{users.filter((u) => u.role === 'employee').length}</div>
        </div>
        <div className="stat-card">
          <h3>Kantor</h3>
          <div className="stat-number">{offices.length}</div>
        </div>
        <div className="stat-card">
          <h3>Check-in Hari Ini</h3>
          <div className="stat-number">
            {filteredRecords.filter(
              (r) => r.type === 'checkin' && new Date(r.timestamp).toDateString() === new Date().toDateString()
            ).length}
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Kantor:</label>
          <select
            value={selectedOffice}
            onChange={(e) => setSelectedOffice(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
          >
            <option value="all">Semua Kantor</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Pegawai:</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
          >
            <option value="all">Semua Pegawai</option>
            {users.filter((u) => u.role === 'employee').map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Tanggal:</label>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </div>

        <button onClick={exportToCSV} className="export-btn">
          Export CSV
        </button>
      </div>

      <div className="summary-section">
        <h3>Ringkasan 30 Hari Terakhir</h3>
        <div className="summary-table">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Pegawai Aktif</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(([date, data]) => (
                <tr key={date}>
                  <td>
                    {new Date(date).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </td>
                  <td>{data.checkins}</td>
                  <td>{data.checkouts}</td>
                  <td>{data.users.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="recent-records">
        <h3>Record Absensi Terbaru</h3>
        <div className="records-table">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Pegawai</th>
                <th>Jenis</th>
                <th>Kantor</th>
                <th>Koordinat</th>
                <th>Jarak</th>
                <th>Geofence</th>
                <th>WiFi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, 50).map((record) => (
                <tr key={record.id}>
                  <td>{new Date(record.timestamp).toLocaleString('id-ID')}</td>
                  <td>{record.user_name}</td>
                  <td className={record.type}>{record.type === 'checkin' ? 'Check-in' : 'Check-out'}</td>
                  <td>{record.office_name}</td>
                  <td>
                    {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}
                  </td>
                  <td>{record.distance_to_office_m}m</td>
                  <td>
                    <span className={`status ${record.geofence_status.toLowerCase()}`}>{record.geofence_status}</span>
                  </td>
                  <td>
                    <span className={`status ${record.wifi_status.toLowerCase()}`}>{record.wifi_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
