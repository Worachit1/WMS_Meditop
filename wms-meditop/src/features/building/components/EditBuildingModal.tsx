import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { buildingApi } from "../services/building.api";

import {
  warningAlert,
  successAlert,
} from "../../../utils/alert";

type EditBuildingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  buildingId: number;
};

const EditBuildingModal = ({
  isOpen,
  onClose,
  onSuccess,
  buildingId,
}: EditBuildingModalProps) => {
  const [formData, setFormData] = useState({
    building_code: "",
    full_name: "",
    short_name: "",
    remark: "",
  });

  const [loading, setLoading] = useState(false);

  const fetchBuildingDetails = async (id: number) => {
    try {
      const response = await buildingApi.getById(id);

      // API returns the building object directly in response.data
      const building = response.data as any;

      if (!building || !building.id) {
        throw new Error("Building not found");
      }

      setFormData({
        building_code: building.building_code,
        full_name: building.full_name,
        short_name: building.short_name,
        remark: building.remark || "",
      });
    } catch (error) {
      console.error("Failed to fetch building details:", error);
      toast.error("Failed to fetch building details");
    }
  };

  useEffect(() => {
    if (isOpen && buildingId) {
      fetchBuildingDetails(buildingId);
    }
  }, [isOpen, buildingId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    if (name === "building_code") {
      const numericValue = value.replace(/\D/g, ""); // Remove non-digits
      if (numericValue.length <= 2) {
        setFormData((prev) => ({ ...prev, [name]: numericValue }));
      }
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.building_code.length !== 2) {
      toast.error("Building Code must be exactly 2 digits");
      return;
    }

    // Show confirmation alert
    const result = await warningAlert("");
    
    if (!result.isConfirmed) {
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        building_code: formData.building_code,
        full_name: formData.full_name,
        short_name: formData.short_name,
        remark: formData.remark.trim() || "-",
      };
      await buildingApi.update(buildingId, submitData);
      
      // Show success alert
      await successAlert("Success!", "Building updated successfully");
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to update building:", error);
      toast.error("Failed to update building");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล Building"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="edit-building-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-building-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full disabled">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="building_code"
              placeholder="Building Code 2 Digits"
              value={formData.building_code}
              onChange={handleChange}
              maxLength={2}
              pattern="\d{2}"
              required
              disabled
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Full Name
            </label>
            <input
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Short Name<span className="required">*</span>
            </label>
            <input
              type="text"
              name="short_name"
              value={formData.short_name}
              onChange={handleChange}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>Remark</label>
            <textarea
              name="remark"
              value={formData.remark}
              onChange={handleChange}
              rows={3}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default EditBuildingModal;
