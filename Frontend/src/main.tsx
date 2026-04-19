

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import "./index.css";
import "./axiosConfig";
import App from './App.tsx';

// --- ลบ token ถ้าออกโปรแกรมเกิน 5 นาที ---
const TOKEN_KEY = "token";
const LOGOUT_TIME_KEY = "logoutTime";
const FIVE_MINUTES = 5 * 60 * 1000;

// เช็คตอนเข้าเว็บ
const logoutTime = localStorage.getItem(LOGOUT_TIME_KEY);
if (logoutTime && localStorage.getItem(TOKEN_KEY)) {
  const diff = Date.now() - Number(logoutTime);
  if (diff > FIVE_MINUTES) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGOUT_TIME_KEY);
  }
}

// บันทึกเวลาออกโปรแกรม
window.addEventListener("beforeunload", () => {
  localStorage.setItem(LOGOUT_TIME_KEY, Date.now().toString());
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
