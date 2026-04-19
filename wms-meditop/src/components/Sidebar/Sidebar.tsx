import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./sidebar.css";
import meditoplogo from "../../assets/images/logo-meditop.png";

import PinModal from "../../features/user/components/PinModal";

interface User {
  id: number;
  first_name: string;
  last_name: string;
  user_level: string;
  pin?: string;
  user_img?: string;
}

type SidebarProps = {
  isMobile?: boolean;
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  user?: User | null;
  showDropdown?: boolean;
  onDropdownToggle?: () => void;
  onResetPassword?: () => void;
  onLogout?: () => void;
};

const Sidebar = ({
  isMobile = false,
  onCloseMobile,
  onCollapsedChange,
  user,
  showDropdown = false,
  onDropdownToggle,
  onResetPassword,
  onLogout,
}: SidebarProps = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [masterOpen, setMasterOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(true);
  const [outboundOpen, setOutboundOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(true);

  const [_isMobileState, setIsMobile] = useState(window.innerWidth <= 992);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTimer, setTooltipTimer] = useState<number | null>(null);
  const location = useLocation();

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [userPinLocal, setUserPinLocal] = useState<string | null>(null);

  const userLevel = (localStorage.getItem("user_level") || "").trim();
  const isOperator = userLevel.trim().toLowerCase() === "operator";

  const handleMasterClick = () => {
    if (collapsed) {
      setCollapsed(false);
      return;
    }

    setMasterOpen((prev) => !prev);
  };

  const handleTransferClick = () => {
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    setTransferOpen((prev) => !prev);
  };

  const handleOutboundClick = () => {
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    setOutboundOpen((prev) => !prev);
  };

  const handleReportClick = () => {
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    setReportOpen((prev) => !prev);
    };

  useEffect(() => {
    if (isMobile) {
      setCollapsed(false);
    }
  }, [isMobile]);

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  const handleToggleClick = () => {
    if (isMobile) {
      onCloseMobile?.();
      return;
    }
    setCollapsed((prev) => !prev);
  };

  const closeIfMobile = () => {
    if (isMobile) {
      onCloseMobile?.();
    }
  };

  const handleMouseEnter = () => {
    const timer = setTimeout(() => {
      setShowTooltip(true);
    }, 800);
    setTooltipTimer(timer);
  };

  const handleMouseLeave = () => {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      setTooltipTimer(null);
    }
    setShowTooltip(false);
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 995);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimer) {
        clearTimeout(tooltipTimer);
      }
    };
  }, [tooltipTimer]);

  return (
    <>
      <button
        className={`sidebar-toggle-mobile${isOpen ? " toggle-right" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Sidebar"
      >
        <i className="fa-solid fa-bars" />
      </button>

      {isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      <div
        className={`sidebar ${isOpen ? "is-open" : ""} ${
          collapsed ? "collapsed" : ""
        }`}
      >
        {/* โลโก้ + ปุ่ม toggle */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={meditoplogo} alt="Logo" className="logo-img" />
          </div>

          <button
            type="button"
            className="sidebar-toggle-desktop"
            onClick={handleToggleClick}
          >
            <i
              className={`fa-solid ${
                isMobile
                  ? "fa-xmark"
                  : `fa-chevron-${collapsed ? "right" : "left"}`
              }`}
            />
          </button>
        </div>

        <hr className="sidebar-divider" />

        <ul className="menu-list">
          {/* Main Menu */}
          <li className="menu-item">
            <Link
              to="/"
              className={`menu-link ${location.pathname === "/" ? "active" : ""}`}
              onClick={closeIfMobile}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Main Menu</span>
            </Link>
          </li>

          {/* Master + submenu */}
          <li className="menu-item">
            <button
              type="button"
              className="menu-link master-toggle"
              onClick={handleMasterClick}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Master</span>
              <i
                className={`fa-solid fa-chevron-${
                  masterOpen ? "up" : "down"
                } master-icon`}
              />
            </button>

            {masterOpen && (
              <ul className="submenu">
                <li>
                  <Link
                    to="/user"
                    className={`submenu-link ${
                      location.pathname === "/user" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">User</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/department"
                    className={`submenu-link ${
                      location.pathname === "/department" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Department</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/building"
                    className={`submenu-link ${
                      location.pathname === "/building" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Building</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/zone_type"
                    className={`submenu-link ${
                      location.pathname === "/zone_type" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Zone Temp</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/zone"
                    className={`submenu-link ${
                      location.pathname === "/zone" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Zone</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/location"
                    className={`submenu-link ${
                      location.pathname === "/location" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Location</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/good"
                    className={`submenu-link ${
                      location.pathname === "/good" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Product</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/barcode"
                    className={`submenu-link ${
                      location.pathname === "/barcode" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Barcode</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/stock"
                    className={`submenu-link ${
                      location.pathname === "/stock" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Stock</span>
                  </Link>
                </li>
              </ul>
            )}
          </li>

          {/* Stock Count */}
          <li className="menu-item">
            <Link
              to="/stock_count"
              className={`menu-link ${
                location.pathname === "/stock_count" ? "active" : ""
              }`}
              onClick={closeIfMobile}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Stock Count</span>
            </Link>
          </li>

          {/* Inbound */}
          <li className="menu-item">
            <Link
              to="/inbound"
              className={`menu-link ${
                location.pathname === "/inbound" ? "active" : ""
              }`}
              onClick={closeIfMobile}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Inbound</span>
            </Link>
          </li>

          {/* Outbound + submenu */}
          <li className="menu-item">
            <button
              type="button"
              className="menu-link master-toggle"
              onClick={handleOutboundClick}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Outbound</span>
              <i
                className={`fa-solid fa-chevron-${outboundOpen ? "up" : "down"} master-icon`}
              />
            </button>

            {outboundOpen && (
              <ul className="submenu">
                <li>
                  <Link
                    to="/outbound?view=doc"
                    className={`submenu-link ${
                      location.pathname === "/outbound" &&
                      new URLSearchParams(location.search).get("view") === "doc"
                        ? "active"
                        : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Doc No.</span>
                  </Link>
                </li>

                <li>
                  <Link
                    to="/outbound?view=picking"
                    className={`submenu-link ${
                      location.pathname === "/outbound" &&
                      new URLSearchParams(location.search).get("view") ===
                        "picking"
                        ? "active"
                        : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">รายการ Picking</span>
                  </Link>
                </li>

                <li>
                  <Link
                    to="/outbound?view=packing"
                    className={`submenu-link ${
                      location.pathname === "/outbound" &&
                      new URLSearchParams(location.search).get("view") ===
                        "packing"
                        ? "active"
                        : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">รายการ Packing</span>
                  </Link>
                </li>
              </ul>
            )}
          </li>

          {/* Borrow Stock */}
          <li className="menu-item">
            <Link
              to="/borrow_stock"
              className={`menu-link ${
                location.pathname === "/borrow_stock" ? "active" : ""
              }`}
              onClick={closeIfMobile}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Borrow Stock</span>
            </Link>
          </li>

          {/* Adjustment */}
          <li className="menu-item">
            <Link
              to="/adjustment"
              className={`menu-link ${
                location.pathname === "/adjustment" ? "active" : ""
              }`}
              onClick={closeIfMobile}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Adjustment</span>
            </Link>
          </li>

          {/* Transfer + submenu */}
          <li className="menu-item">
            <button
              type="button"
              className="menu-link master-toggle"
              onClick={handleTransferClick}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Transfer</span>
              <i
                className={`fa-solid fa-chevron-${
                  transferOpen ? "up" : "down"
                } master-icon`}
              />
            </button>

            {transferOpen && (
              <ul className="submenu">
                <li>
                  <Link
                    to="/tf-exp-ncr"
                    className={`submenu-link ${
                      location.pathname === "/tf-exp-ncr" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">EXP&NCR</span>
                  </Link>
                </li>

                <li>
                  <Link
                    to="/tf-movement"
                    className={`submenu-link ${
                      location.pathname === "/tf-movement" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Movement</span>
                  </Link>
                </li>

                <li>
                  <Link
                    to="/bor"
                    className={`submenu-link ${
                      location.pathname === "/bor" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Swap</span>
                  </Link>

                </li>
              </ul>

            )}
          </li>

            {/* Report */}
            <li className="menu-item">
            <button
              type="button"
              className="menu-link master-toggle"
              onClick={handleReportClick}
            >
              <span>
                <i className="fa-solid fa-circle status-dot" />
              </span>
              <span className="menu-text">Report</span>
              <i
                className={`fa-solid fa-chevron-${
                  reportOpen ? "up" : "down"
                } master-icon`}
              />
            </button>

            {reportOpen && (
              <ul className="submenu">
                <li>
                  <Link
                    to="/report-stock"
                    className={`submenu-link ${
                      location.pathname === "/report-stock" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Stock คงคลัง</span>
                  </Link>
                </li>

                <li>
                  <Link
                    to="/report-movement"
                    className={`submenu-link ${
                      location.pathname === "/report-movement" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">History Movement</span>
                  </Link>
                </li>

                <li>
                  <Link
                    to="/report-stock-all"
                    className={`submenu-link ${
                      location.pathname === "/report-stock-all" ? "active" : ""
                    }`}
                    onClick={closeIfMobile}
                  >
                    <span>
                      <i className="fa-solid fa-circle status-dot" />
                    </span>
                    <span className="submenu-text">Stocks</span>
                  </Link>
                </li>

              </ul>
            )}
          </li>
        </ul>


        {/* Sidebar Footer - User Profile */}
        {!collapsed && (
          <div className="sidebar-footer">
            <div
              className="user-profile-sidebar"
              onClick={onDropdownToggle}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="user-avatar-wrapper">
                {user?.user_img && user.user_img !== "-" ? (
                  <img
                    src={user.user_img}
                    alt="User"
                    className="user-avatar-sidebar"
                  />
                ) : (
                  <i className="fa fa-user user-icon-sidebar"></i>
                )}
              </div>
              {!collapsed && (
                <div className="user-info-sidebar">
                  <span className="user-name">
                    {user ? `${user.first_name} ${user.last_name}` : "User"}
                  </span>
                  <span className="user-role">
                    {user ? user.user_level : "N/A"}
                  </span>
                </div>
              )}
              {!collapsed && (
                <i className="fa fa-chevron-down dropdown-icon"></i>
              )}
              {showTooltip && user && (
                <div className="user-tooltip">
                  {user.first_name} {user.last_name}
                </div>
              )}
              {showDropdown && !collapsed && user && (
                <div className="dropdown-menu-sidebar">
                  {!isOperator && (
                    <button onClick={() => setPinModalOpen(true)}>
                      <i className="fa-solid fa-lock"></i> PIN
                    </button>
                  )}
                  <button onClick={onResetPassword}>
                    <i className="fa-solid fa-key"></i> เปลี่ยนรหัสผ่าน
                  </button>
                  <button onClick={onLogout}>
                    <i className="fa fa-sign-out"></i> ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <PinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        user={{
          id: user?.id ?? "",
          first_name: user?.first_name ?? "",
          last_name: user?.last_name ?? "",
          pin: userPinLocal ?? (user?.pin as any) ?? null,
        }}
        onPinUpdated={(newPin) => {
          setUserPinLocal(newPin);
          // ถ้าคุณมี state user จาก parent แนะนำให้ sync ขึ้นไปด้วย
        }}
      />
    </>
  );
};

export default Sidebar;
