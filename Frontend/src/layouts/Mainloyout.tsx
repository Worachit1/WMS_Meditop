import { useState, useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Sidebar from "../components/Sidebar/Sidebar";
import "./mainlayout.css";

import ResetPasswordModal from "../components/Resetpassword/ResetPasswordModal";

import type { UserType } from "../features/user/types/user.type";

const MainLayout = () => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        // Decode JWT token to get user id
        const payload = JSON.parse(atob(token.split('.')[1]));
        // Try to get id from multiple possible locations
        const userId = payload.id || payload.sub || payload.userId || payload.empId;
        if (!userId) {
          console.error('Cannot find user id in JWT payload:', payload);
          return;
        }
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/users/get/${userId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = res.data;
        setUser({ ...data, id: Number(data.id) });
        if (Array.isArray(data?.departments)) {
          localStorage.setItem("departments", JSON.stringify(data.departments));
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
      }
    };

    fetchUserProfile();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      setIsMobile(window.innerWidth <= 992);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsSidebarOpen(false);
    }
  }, [isMobile]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    toast.success("ออกจากระบบสำเร็จ");
    setTimeout(() => navigate("/auth/login"), 1000);
  };

  const handleResetPassword = () => {
    setIsResetPasswordModalOpen(true);
  };

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <div className={`main-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar
          isMobile={isMobile}
          isOpenOnMobile={isMobile ? isSidebarOpen : true}
          onCloseMobile={() => setIsSidebarOpen(false)}
          onCollapsedChange={setIsSidebarCollapsed}
          user={user}
          showDropdown={showDropdown}
          onDropdownToggle={() => setShowDropdown(!showDropdown)}
          onResetPassword={handleResetPassword}
          onLogout={handleLogout}
        />
        {isMobile && (
          <div
            className={`sidebar-overlay ${isSidebarOpen ? "show" : ""}`}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      <div className="main-content-wrapper">
        <div className="top-header">
          {isMobile && (
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="เปิดเมนู"
            >
              <i className="fa fa-bars" />
            </button>
          )}
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
      </div>
       <ResetPasswordModal
        isOpen={isResetPasswordModalOpen}
        userId={user?.id ?? 0}
        onClose={() => setIsResetPasswordModalOpen(false)}
        onSuccess={() => {
          toast.success("Password reset successfully");
          setIsResetPasswordModalOpen(false);
        }}
      />
    </>
  );
};

export default MainLayout;