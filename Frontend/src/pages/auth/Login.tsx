import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import BGlogin from "../../assets/images/bg-login.png";
import meditopLogo from "../../assets/images/logo-login.png";
import "./login.css";

const Login = () => {
  const [form, setForm] = useState({ usernameOrEmail: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value.trim() });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    // ตรวจฝั่ง frontend ก่อนเลย กันยิง API ฟรี ๆ
    if (!form.usernameOrEmail || !form.password) {
      toast.error("usernameOrEmail and password are required");
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/login`,
        {
          usernameOrEmail: form.usernameOrEmail,
          password: form.password,
        },
        {
          // ❗ บอก axios ว่า "ทุก status ถือว่าไม่ error ให้ส่งมาที่นี่"
          validateStatus: () => true,
        },
      );

      // console.log("Login response:", res.status, res.data)E

      if (res.status === 200 && res.data.token) {
        const rawStatus =
          res.data?.user?.status ??
          res.data?.data?.status ??
          res.data?.status ??
          null;
        const normalizedStatus =
          typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : null;

        if (normalizedStatus && normalizedStatus !== "activate") {
          toast.error(
            "This account is deactivated. Please contact the administrator.",
          );
          return;
        }

        localStorage.setItem("token", res.data.token);

        // Store user information
        if (res.data.user) {
          localStorage.setItem("user", JSON.stringify(res.data.user));
          if (res.data.user.first_name) {
            localStorage.setItem("first_name", res.data.user.first_name);
          }
          if (res.data.user.last_name) {
            localStorage.setItem("last_name", res.data.user.last_name);
          }
          if (res.data.user.id) {
            localStorage.setItem("id", String(res.data.user.id));
          }
          if (res.data.user.department) {
            localStorage.setItem("department", res.data.user.department);
          }

          const rawLevel =
            res.data?.user?.user_level ?? // ✅ ของจริงตามรูป
            res.data?.user?.level ?? // เผื่อบางที่ยังส่ง level
            res.data?.data?.user?.user_level ??
            res.data?.data?.user?.level ??
            null;

          if (rawLevel != null) {
            localStorage.setItem("user_level", String(rawLevel));
          }
        }

        axios.defaults.headers.common["Authorization"] =
          `Bearer ${res.data.token}`;

        toast.success("Login successful!");
        setTimeout(() => navigate("/"), 1500);
        return;
      }
      // ❌ กรณีไม่สำเร็จ (เช่น 401, 400) → แสดงข้อความจาก backend
      const backendMessage: string | undefined = res.data?.message;

      toast.error(backendMessage || "Login failed, please try again");
    } catch (error: any) {
      // จะเข้ามาเฉพาะเคส network ล่ม, CORS, axios crash จริง ๆ
      console.error("Login error (network / unexpected):", error);

      const fallbackMessage =
        error?.message || "An unexpected error occurred during login";

      toast.error(fallbackMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ToastContainer position="top-right" autoClose={2000} />
      <div
        className="login-container"
        style={{ backgroundImage: `url(${BGlogin})` }}
      >
        <div className="login-overlay">
          <div className="login-card">
            <div className="login-logo">
              <img src={meditopLogo} alt="Meditop Logo" />
            </div>
            <form onSubmit={onSubmit}>
              <div className="login-form-group">
                <label htmlFor="usernameOrEmail">ชื่อผู้ใช้</label>
                <input
                  type="text"
                  id="usernameOrEmail"
                  name="usernameOrEmail"
                  placeholder="Username"
                  value={form.usernameOrEmail}
                  onChange={onChange}
                  required
                />
              </div>
              <div className="login-form-group">
                <label htmlFor="password">รหัสผ่าน</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="*******"
                  value={form.password}
                  onChange={onChange}
                  required
                />
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? <>กำลังเข้าสู่ระบบ...</> : <>เข้าสู่ระบบ</>}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
