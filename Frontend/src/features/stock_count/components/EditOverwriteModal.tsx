import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { stock_countApi } from "../services/stock_count.api";
import { warningAlert, successAlert } from "../../../utils/alert";
import type { StockCountType } from "../types/stock_count.type";

import "../stock_count.css";

type EditOverwriteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stockCountId: string | null;
};

const EditOverwriteModal = ({
  isOpen,
  onClose,
  onSuccess,
  stockCountId,
}: EditOverwriteModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    lot: "",
    quantity: 0,
    overwrite_remark: "",
  });

  const [stockCount, setStockCount] = useState<StockCountType | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [currentTimestamp, setCurrentTimestamp] = useState<string>("");

  useEffect(() => {
    // Get current user from localStorage
    const firstName = localStorage.getItem("first_name");
    const lastName = localStorage.getItem("last_name");
    const userJson = localStorage.getItem("user");

    let displayName = "Unknown User";
    if (firstName && lastName) {
      displayName = `${firstName} ${lastName}`;
    } else if (userJson) {
      try {
        const user = JSON.parse(userJson);
        displayName = user.display_name || displayName;
      } catch (error) {
        console.error("Error parsing user from localStorage:", error);
      }
    }

    console.log("Current User:", displayName);
    setCurrentUser(displayName);

    // Get current timestamp
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear() + 543}, ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setCurrentTimestamp(formattedDate);
  }, [isOpen]);

  const fetchStockCountDetails = async (id: string) => {
    setLoading(true);
    try {
      const response = await stock_countApi.getById(id);

      // API returns the stock count object directly in response.data
      const stockCount = response.data as any;

      if (!stockCount || !stockCount.id) {
        throw new Error("Stock count not found");
      }

      setStockCount(stockCount);
      setFormData({
        lot: stockCount.lot || "",
        quantity: stockCount.quantity || 0,
        overwrite_remark: "",
      });
    } catch (error) {
      console.error("Failed to fetch stock count details:", error);
      toast.error("Failed to fetch stock count details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && stockCountId) {
      setLoading(true);
      fetchStockCountDetails(stockCountId);
    }
  }, [isOpen, stockCountId]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === "quantity" ? Number(value) : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockCountId) return;
    // Show confirmation alert
    const result = await warningAlert("");
    if (!result.isConfirmed) {
      return;
    }
    setIsSubmitting(true);
    try {
      await stock_countApi.update(stockCountId, formData);
      successAlert("Stock count updated successfully.");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating stock count:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="edit-OVW-modal-overlay" onClick={handleOverlayClick}>
      <div className="edit-OVW-modal-content">
        <h2 className="edit-OVW-title">Overwrite</h2>

        {loading ? (
          <div className="edit-OVW-loading">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Display Current Values */}
            <div className="edit-OVW-info-section">
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">SKU :</label>
                <span className="edit-OVW-value">{stockCount?.sku || "-"}</span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">Lot :</label>
                <span className="edit-OVW-value">{stockCount?.lot || "-"}</span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">Lock No. :</label>
                <span className="edit-OVW-value">
                  {stockCount?.lock_no || "..."}
                </span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">QTY :</label>
                <span className="edit-OVW-value">
                  {stockCount?.quantity || "0"}
                </span>
              </div>
            </div>

            <hr className="edit-OVW-divider" />

            {/* Input Fields */}
            <div className="edit-OVW-input-section">
              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">Lot</label>
                <input
                  type="text"
                  name="lot"
                  value={formData.lot}
                  onChange={handleInputChange}
                  className="edit-OVW-input"
                  placeholder="ระบุ Lot"
                />
              </div>
              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">QTY</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  className="edit-OVW-input"
                  placeholder="ระบุจำนวน"
                />
              </div>
              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">
                  เหตุผลการ Overwrite
                </label>
                <input
                  type="text"
                  name="overwrite_remark"
                  value={formData.overwrite_remark}
                  onChange={handleInputChange}
                  className="edit-OVW-input"
                  placeholder="เหตุผลการ Overwrite"
                />
              </div>
            </div>

            <hr className="edit-OVW-divider" />

            {/* User and Timestamp */}
            <div className="edit-OVW-footer-info">
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">User</label>
                <span className="edit-OVW-value">{currentUser}</span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">Timestamp</label>
                <span className="edit-OVW-value">{currentTimestamp}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="edit-OVW-actions">
              <button
                type="button"
                onClick={onClose}
                className="edit-OVW-btn-cancel"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="edit-OVW-btn-confirm"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Processing..." : "Confirm"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditOverwriteModal;
