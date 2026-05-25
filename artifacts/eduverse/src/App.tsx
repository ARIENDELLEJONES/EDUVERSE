import React, { useState, useEffect } from 'react';
import { getUser, getToken, logout, setUser, setToken } from './api';
import Landing from './pages/Landing';
import GradeStudentPortal from './pages/GradeStudentPortal';
import GradeAdminDashboard from './pages/GradeAdminDashboard';
import QuizTeacherDashboard from './pages/QuizTeacherDashboard';
import QuizStudentPortal from './pages/QuizStudentPortal';
import AdminPanel from './pages/AdminPanel';

interface ToastState {
  message: string;
  type: string;
}

export default function App() {
  const [user, setUserState] = useState<any>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const saved = getUser();
    const savedMode = localStorage.getItem('eduverse_mode');
    if (saved && getToken()) {
      setUserState(saved);
      setMode(savedMode);
    }
  }, []);

  // Screen Wake Lock: Keep screen awake while app is open
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
      } catch {}
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) { wakeLock.release().catch(() => {}); }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin');
    if (pin) {
      sessionStorage.setItem('eduverse_join_pin', pin);
      const path = window.location.pathname.replace(/\/$/, '');
      if (path.endsWith('/quiz/live') || path === '/quiz/live') {
        window.history.replaceState({}, document.title, '/');
      }
    }
  }, []);

  const showToast = (message: string, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = (userData: any, loginMode: string, token: string) => {
    setToken(token);
    setUser(userData);
    setUserState(userData);
    setMode(loginMode);
    localStorage.setItem('eduverse_mode', loginMode);
  };

  const handleLogout = () => {
    logout();
    setUserState(null);
    setMode(null);
  };

  const renderContent = () => {
    if (!user) return <Landing onLogin={handleLogin} showToast={showToast} />;

    if (mode === 'grades') {
      if (user.role === 'admin' || user.role === 'teacher') {
        return <GradeAdminDashboard user={user} onLogout={handleLogout} showToast={showToast} />;
      }
      return <GradeStudentPortal user={user} onLogout={handleLogout} showToast={showToast} />;
    }

    if (mode === 'quiz') {
      if (user.role === 'teacher') {
        return <QuizTeacherDashboard user={user} onLogout={handleLogout} showToast={showToast} />;
      }
      return <QuizStudentPortal user={user} onLogout={handleLogout} showToast={showToast} />;
    }

    if (mode === 'admin') {
      return <AdminPanel user={user} onLogout={handleLogout} showToast={showToast} />;
    }

    return <Landing onLogin={handleLogin} showToast={showToast} />;
  };

  return (
    <div>
      {renderContent()}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
