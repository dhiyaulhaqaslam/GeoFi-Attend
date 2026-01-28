import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./AdminDashboard.css";

interface AttendanceRecord {
  id: number;
  user_id: number;
  office_id: number;
  type: "checkin" | "checkout";
  timestamp: string;
  latitude: number;
  longitude: number;
  distance_to_office_m: number;
  geofence_status: "PASS" | "FAIL";
  wifi_status: "PASS" | "FAIL" | "NOT_CHECKED";
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
  role: "employee" | "admin";
}

type FilterOffice = number | "all";
type FilterUser = number | "all";

interface AdminDashboardProps {
  // kalau kamu sudah punya state login, lempar adminUserId dari App
  adminUserId?: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ adminUserId = 1 }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOffice, setSelectedOffice] = useState<FilterOffice>("all");
  const [selectedUser, setSelectedUser] = useState<FilterUser>("all");
  const [dateFilter, setDateFilter] = useState<string>("");

  const headers = useMemo(() => ({ "user-id": adminUserId.toString() }), [adminUserId]);

  const loadOffices = async () => {
    const r = await axios.get("/api/attendance/offices");
    setOffices(r.data ?? []);
  };

  const loadUsers = async () => {
    const r = await axios.get("/api/attendance/admin/users", { headers });
    if (r.data?.success) setUsers(r.data.data ?? []);
  };

  const loadRecords = async () => {
    const qs = new URLSearchParams();
    qs.set("limit", "1000");
    qs.set("offset", "0");

    if (selectedOffice !== "all") qs.set("officeId", String(selectedOffice));
    if (selectedUser !== "all") qs.set("userId", String(selectedUser));
    if (dateFilter) qs.set("date", dateFilter);

    const r = await axios.get(`/api/attendance/admin/records?${qs.toString()}`, { headers });
    if (r.data?.success) setRecords(r.data.data ?? []);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);

      await Promise.all([loadOffices(), loadUsers()]);
      await loadRecords();
    } catch (e: any) {
      const msg = e?.response?.data?.error || "Gagal memuat data dashboard admin";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUserId]);

  useEffect(() => {
    // reload records ketika filter berubah
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadRecords();
      } catch (e: any) {
        const msg = e?.response?.data?.error || "Gagal memuat data records";
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOffice, selectedUser, dateFilter]);

  const filteredRecords = records;

  const employeeCount = users.filter((u) => u.role === "employee").length;

  const checkinToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return filteredRecords.filter(
      (r) => r.type === "checkin" && new Date(r.timestamp).toDateString() === todayStr
    ).length;
  }, [filteredRecords]);

  const getAttendanceSummary = () => {
    const summary: { [key: string]: { checkins: number; checkouts: number; users: Set<number> } } = {};

    filteredRecords.forEach((record) => {
      const date = new Date(record.timestamp).toISOString().split("T")[0];
      if (!summary[date]) summary[date] = { checkins: 0, checkouts: 0, users: new Set() };
      if (record.type === "checkin") summary[date].checkins++;
      else summary[date].checkouts++;
      summary[date].users.add(record.user_id);
    });

    return Object.entries(summary)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30);
  };

  const exportToCSV = () => {
    const csvContent = [
      ["Tanggal", "Waktu", "Nama", "Jenis", "Kantor", "Koordinat", "Jarak", "Geofence", "WiFi", "IP"],
      ...filteredRecords.map((record) => [
        new Date(record.timestamp).toLocaleDateString("id-ID"),
        new Date(record.timestamp).toLocaleTimeString("id-ID"),
        record.user_name,
        record.type === "checkin" ? "Check-in" : "Check-out",
        record.office_name,
        `${record.latitude}, ${record.longitude}`,
        String(record.distance_to_office_m),
        record.geofence_status,
        record.wifi_status,
        record.ip_address || "",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-absensi-${new Date().toISOString().split("T")[0]}.csv`;
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
          <div className="stat-number">{employeeCount}</div>
        </div>
        <div className="stat-card">
          <h3>Kantor</h3>
          <div className="stat-number">{offices.length}</div>
        </div>
        <div className="stat-card">
          <h3>Check-in Hari Ini</h3>
          <div className="stat-number">{checkinToday}</div>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Kantor:</label>
          <select
            value={selectedOffice}
            onChange={(e) => setSelectedOffice(e.target.value === "all" ? "all" : parseInt(e.target.value))}
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
            onChange={(e) => setSelectedUser(e.target.value === "all" ? "all" : parseInt(e.target.value))}
          >
            <option value="all">Semua Pegawai</option>
            {users
              .filter((u) => u.role === "employee")
              .map((user) => (
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
                    {new Date(date).toLocaleDateString("id-ID", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
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
                  <td>{new Date(record.timestamp).toLocaleString("id-ID")}</td>
                  <td>{record.user_name}</td>
                  <td className={record.type}>{record.type === "checkin" ? "Check-in" : "Check-out"}</td>
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
