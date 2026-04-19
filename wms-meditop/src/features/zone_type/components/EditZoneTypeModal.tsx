import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { zoneTypeApi } from "../services/zone_type.api";

import {
  warningAlert,
  successAlert,
} from "../../../utils/alert";

type EditZoneTypeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zoneTypeId: number; 
};

const EditZoneTypeModal = ({
  isOpen,
  onClose,
  onSuccess,
  zoneTypeId,
}: EditZoneTypeModalProps) => {
  const [formData, setFormData] = useState({
    zone_type_code: "",
    full_name: "",
    short_name: "",
    remark: "",
  });

  const [loading, setLoading] = useState(false);

  const fetchZoneTypeDetails = async (id: number) => {
    try {
      const response = await zoneTypeApi.getById(id);
      console.log("Response:", response.data);

      // API returns the zone type object directly in response.data
      const zoneType = response.data as any;

      if (!zoneType || !zoneType.zone_type_code) {
        throw new Error("Zone type not found");
      }

      setFormData({
        zone_type_code: zoneType.zone_type_code,
        full_name: zoneType.full_name,
        short_name: zoneType.short_name,
        remark: zoneType.remark || "",
      });
    } catch (error) {
      console.error("Failed to fetch zone type details:", error);
      toast.error("Failed to fetch zone type details");
    }
  };

  useEffect(() => {
    if (isOpen && zoneTypeId) {
      fetchZoneTypeDetails(zoneTypeId);
    }
  }, [isOpen, zoneTypeId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    if (name === "zone_type_code") {
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

    if (formData.zone_type_code.length !== 2) {
      toast.error("ID must be exactly 2 digits");
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
        zone_type_code: formData.zone_type_code,
        full_name: formData.full_name,
        short_name: formData.short_name,
        remark: formData.remark.trim() || "-",
      };
      await zoneTypeApi.update(zoneTypeId, submitData);
      
      // Show success alert
      await successAlert("Success!", "Zone type updated successfully");
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to update zone type:", error);
      toast.error("Failed to update zone type");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล Zone Temp"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="edit-zone-type-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-zone-type-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="zone_type_code"
              value={formData.zone_type_code}
              onChange={handleChange}
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
              Short Name <span className="required">*</span>
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

export default EditZoneTypeModal;
