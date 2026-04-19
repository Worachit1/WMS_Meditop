import { useState } from "react";
import axios from "axios";
import "./resetpassword.css";

// import Loading from "../Loading/Loading";
import Modal from "../Modal/Modal";

type ResetPasswordModalProps = {
  isOpen: boolean;
  userId: number;
  onClose: () => void;
  onSuccess: () => void;
};
const ResetPasswordModal = ({
  isOpen,
  userId,
  onClose,
  onSuccess,
}: ResetPasswordModalProps) => {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/users/update/${userId}`,
        {
          password: newPassword,
        }
      );
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error resetting password:", error);
      setError("Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset Password"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="reset-password-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="resetPassword-form-group form-group-full">
            <label>
              New Password <span className="required">*</span>
            </label>
            <input
              type="password"
              name="newPassword"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="resetPassword-form-group form-group-full">
            <label>
              Confirm Password <span className="required">*</span>
            </label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>
        {error && <div className="error-message">{error}</div>}
      </form>
    </Modal>
  );
};
export default ResetPasswordModal;
