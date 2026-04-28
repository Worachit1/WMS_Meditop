import { useEffect, useState } from "react";
import Modal from "../../../../components/Modal/Modal";
import { userApi } from "../../services/user.api";
import "./profile.css";

type ProfileUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  tel?: string;
  user_level?: string;
  status?: string;
  remark?: string;
  user_img?: string | null;
  departments?: { id: number; short_name: string }[];
};

type ProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userId: number | null;
};

const ProfileModal = ({ isOpen, onClose, userId }: ProfileModalProps) => {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!isOpen || !userId) return;

      try {
        setLoading(true);
        const res = await userApi.getById(userId);

        const data = (res.data as any)?.data ?? res.data;
        setUser(data);
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [isOpen, userId]);

  const departmentText =
    user?.departments?.map((d) => d.short_name).join(", ") || "-";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ข้อมูลผู้ใช้งาน"
      footer={
        <>
          <div className="user-prf-footer">
            <button
              type="button"
              className="user-prf-close-btn"
              onClick={onClose}
            >
              ปิด
            </button>
          </div>
        </>
      }
    >
      <div className="user-prf-card">
        <div className="user-prf-body">
          {loading ? (
            <div className="user-prf-loading">Loading...</div>
          ) : (
            <>
              <div className="user-prf-avatar-wrap">
                {user?.user_img ? (
                  <img
                    src={user.user_img}
                    alt="Profile"
                    className="user-prf-avatar-img"
                  />
                ) : (
                  <div className="user-prf-avatar-placeholder">
                    <div className="user-prf-avatar-head" />
                    <div className="user-prf-avatar-body" />
                  </div>
                )}
              </div>

              <div className="user-prf-row user-prf-row-2">
                <div className="user-prf-field">
                  <label>ชื่อ</label>
                  <input value={user?.first_name || "-"} readOnly />
                </div>

                <div className="user-prf-field">
                  <label>นามสกุล</label>
                  <input value={user?.last_name || "-"} readOnly />
                </div>
              </div>

              <div className="user-prf-row">
                <div className="user-prf-field">
                  <label>E-mail</label>
                  <input value={user?.email || "-"} readOnly />
                </div>
              </div>

              <div className="user-prf-row">
                <div className="user-prf-field">
                  <label>Tel.</label>
                  <input value={user?.tel || "-"} readOnly />
                </div>
              </div>

              <div className="user-prf-row">
                <div className="user-prf-field">
                  <label>User Level</label>
                  <input value={user?.user_level || "-"} readOnly />
                </div>
              </div>

              <div className="user-prf-row">
                <div className="user-prf-field">
                  <label>Department</label>
                  <input value={departmentText} readOnly />
                </div>
              </div>

              <div className="user-prf-row">
                <div className="user-prf-field">
                  <label>Status</label>
                  <input value={user?.status || "-"} readOnly />
                </div>
              </div>

              <div className="user-prf-row">
                <div className="user-prf-field user-prf-textarea-field">
                  <label>Remark</label>
                  <textarea value={user?.remark || "-"} readOnly />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ProfileModal;
