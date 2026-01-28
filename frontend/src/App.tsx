import React, { useEffect, useState } from 'react';
import AttendanceForm from './components/AttendanceForm';
import AttendanceHistory from './components/AttendanceHistory';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

const API_BASE = '';

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
    username: string;
    name: string;
    role: 'employee' | 'admin';
}

export default function App() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [offices, setOffices] = useState<Office[]>([]);
    const [activeTab, setActiveTab] = useState<'attendance' | 'history' | 'admin'>('attendance');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            const userId = localStorage.getItem('userId');
            if (userId) {
                const mockUsers: User[] = [
                    { id: 1, username: 'admin', name: 'Administrator', role: 'admin' },
                    { id: 2, username: 'pegawai1', name: 'Pegawai Satu', role: 'employee' }
                ];
                const user = mockUsers.find(u => u.id === parseInt(userId, 10));
                if (user) setCurrentUser(user);
            }

            await loadOffices();
            setLoading(false);
        };

        init();
    }, []);

    const loadOffices = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/attendance/offices`);
            if (!res.ok) {
                console.error("Failed to load offices:", res.status);
                return;
            }
            const data: Office[] = await res.json();
            setOffices(data);
        } catch (e) {
            console.error("Error loading offices:", e);
        }
    };


    const handleLogin = (userId: number) => {
        const mockUsers: User[] = [
            { id: 1, username: 'admin', name: 'Administrator', role: 'admin' },
            { id: 2, username: 'pegawai1', name: 'Pegawai Satu', role: 'employee' }
        ];
        const user = mockUsers.find(u => u.id === userId);
        if (user) {
            setCurrentUser(user);
            localStorage.setItem('userId', String(userId));
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('userId');
        setActiveTab('attendance');
    };

    if (loading) return <div className="loading">Loading...</div>;
    if (!currentUser) return <LoginForm onLogin={handleLogin} />;

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

function LoginForm({ onLogin }: { onLogin: (userId: number) => void }) {
    const [selectedUser, setSelectedUser] = useState<number>(2);

    return (
        <div className="login-container">
            <div className="login-form">
                <h2>Login Sistem Absensi</h2>
                <form onSubmit={(e) => { e.preventDefault(); onLogin(selectedUser); }}>
                    <div className="form-group">
                        <label>Pilih User (Demo):</label>
                        <select value={selectedUser} onChange={(e) => setSelectedUser(parseInt(e.target.value, 10))}>
                            <option value={1}>Administrator</option>
                            <option value={2}>Pegawai Satu</option>
                        </select>
                    </div>
                    <button type="submit" className="login-btn">Login</button>
                </form>
                <div className="demo-notice">
                    <p><strong>Demo Mode:</strong> Auth masih demo (pakai header user-id).</p>
                </div>
            </div>
        </div>
    );
}
