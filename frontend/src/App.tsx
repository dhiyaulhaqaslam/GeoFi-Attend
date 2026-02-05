// frontend/src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import AttendanceForm from './components/AttendanceForm';
import AttendanceHistory from './components/AttendanceHistory';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

interface Office {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    address: string;
}

type Role = 'employee' | 'admin';

interface User {
    id: number;
    username: string;
    name: string;
    role: Role;
}

export default function App() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [offices, setOffices] = useState<Office[]>([]);
    const [activeTab, setActiveTab] = useState<'attendance' | 'history' | 'admin'>('attendance');
    const [loading, setLoading] = useState(true);

    const [users, setUsers] = useState<User[]>([]);
    const [initError, setInitError] = useState<string | null>(null);

    const loadUsers = async (): Promise<User[]> => {
        const res = await fetch('/api/attendance/demo-users');
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Failed load users: ${res.status} ${txt}`);
        }
        const json = await res.json();
        return (json.data ?? []) as User[];
    };

    const loadOffices = async (): Promise<Office[]> => {
        const res = await fetch('/api/attendance/offices');
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Failed load offices: ${res.status} ${txt}`);
        }
        return (await res.json()) as Office[];
    };

    useEffect(() => {
        const init = async () => {
            try {
                setInitError(null);

                // load users dulu
                const loadedUsers = await loadUsers();
                setUsers(loadedUsers);

                // restore session (kalau ada)
                const storedId = localStorage.getItem('userId');
                if (storedId) {
                    const uid = Number(storedId);
                    const u = loadedUsers.find(x => x.id === uid);
                    if (u) setCurrentUser(u);
                    else localStorage.removeItem('userId');
                }

                // load offices
                const loadedOffices = await loadOffices();
                setOffices(loadedOffices);
            } catch (e: any) {
                console.error('Init error:', e);
                setInitError(e?.message || 'Init failed');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, []);

    const handleLogin = (userId: number) => {
        const user = users.find(u => u.id === userId);
        if (!user) {
            alert(`User id=${userId} tidak ditemukan (cek /api/attendance/demo-users)`);
            return;
        }
        setCurrentUser(user);
        localStorage.setItem('userId', String(userId));
        setActiveTab('attendance');
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('userId');
        setActiveTab('attendance');
    };

    // safety: user non-admin tidak boleh stay di tab admin
    useEffect(() => {
        if (currentUser?.role !== 'admin' && activeTab === 'admin') {
            setActiveTab('attendance');
        }
    }, [currentUser, activeTab]);

    if (loading) return <div className="loading">Loading...</div>;

    if (initError) {
        return (
            <div className="loading" style={{ padding: 16 }}>
                <h3>Gagal inisialisasi</h3>
                <p>{initError}</p>
                <p style={{ marginTop: 8 }}>
                    Pastikan backend jalan, dan endpoint:
                    <br />
                    <code>/api/attendance/demo-users</code> dan <code>/api/attendance/offices</code> tersedia.
                </p>
            </div>
        );
    }

    if (!currentUser) {
        return <LoginForm users={users} onLogin={handleLogin} />;
    }

    return (
        <div className="App">
            <header className="App-header">
                <h1>Sistem Absensi Online</h1>
                <div className="user-info">
                    <span>Welcome, {currentUser.name}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </header>

            <nav className="App-nav">
                <button className={activeTab === 'attendance' ? 'active' : ''} onClick={() => setActiveTab('attendance')}>
                    Absensi
                </button>
                <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
                    Riwayat
                </button>
                {currentUser.role === 'admin' && (
                    <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>
                        Admin Dashboard
                    </button>
                )}
            </nav>

            <main className="App-main">
                {activeTab === 'attendance' && <AttendanceForm offices={offices} userId={currentUser.id} />}
                {activeTab === 'history' && <AttendanceHistory userId={currentUser.id} />}
                {activeTab === 'admin' && currentUser.role === 'admin' && <AdminDashboard />}
            </main>
        </div>
    );
}

function LoginForm({ users, onLogin }: { users: User[]; onLogin: (userId: number) => void }) {
    const firstId = useMemo(() => (users.length ? users[0].id : 1), [users]);
    const [selectedUser, setSelectedUser] = useState<number>(firstId);

    useEffect(() => {
        setSelectedUser(firstId);
    }, [firstId]);

    return (
        <div className="login-container">
            <div className="login-form">
                <h2>Login Sistem Absensi</h2>

                {users.length === 0 ? (
                    <p>Tidak ada user. Jalankan seed, lalu pastikan endpoint demo-users mengembalikan data.</p>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); onLogin(selectedUser); }}>
                        <div className="form-group">
                            <label>Pilih User (Demo):</label>
                            <select value={selectedUser} onChange={(e) => setSelectedUser(Number(e.target.value))}>
                                {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name} ({u.role})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button type="submit" className="login-btn">Login</button>
                    </form>
                )}

                <div className="demo-notice" style={{ marginTop: 12 }}>
                    <p><strong>Demo Mode:</strong> Auth masih demo (pakai header <code>user-id</code>).</p>
                </div>
            </div>
        </div>
    );
}
