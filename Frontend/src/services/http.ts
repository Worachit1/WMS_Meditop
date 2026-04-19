import axios, { AxiosError } from "axios";

/**
 * Base URL
 * - Vite: import.meta.env.VITE_API_URL
 * - ตัวอย่าง: http://localhost:8000/api
 */
const BASE_URL = import.meta.env.VITE_API_URL;

/**
 * Axios instance กลาง
 */
export const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * =========================
 * Request Interceptor
 * =========================
 * แนบ token ทุก request
 */
http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * =========================
 * Response Interceptor
 * =========================
 * จัดการ error กลาง
 */
http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    const status = error.response?.status;
    const message =
      (error.response?.data as any)?.message ||
      error.message ||
      "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์";

    if (status === 401) {
      console.warn("Unauthorized → redirect to login");
      // localStorage.removeItem("token");
      // window.location.href = "/login";
    }

    if (status === 403) {
      console.warn("Forbidden");
    }

    const err: any = new Error(message);
    err.status = status;
    err.response = error.response;
    return Promise.reject(err);
  }
);