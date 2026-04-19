import { useState } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { zoneTypeApi } from "../services/zone_type.api";
import { confirmAlert, successAlert } from "../../../utils/alert";

type AddZoneTypeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const AddZoneTypeModal = ({
  isOpen,
  onClose,
  onSuccess,
}: AddZoneTypeModalProps) => {
  const [formData, setFormData] = useState({
    zone_type_code: "",
    full_name: "",
    short_name: "",
    remark: "",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    // Validate ID field - only allow 2 digits
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

    // Validate ID
    if (formData.zone_type_code.length !== 2) {
      toast.error("ID must be exactly 2 digits");
      return;
    }

    const result = await confirmAlert("");
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

      await zoneTypeApi.create(submitData);

      setFormData({ zone_type_code: "", full_name: "", short_name: "", remark: "" });
      await successAlert("Success!", "Zone type created successfully");
      onSuccess();
      onClose(); // ✅ ปิด modal หลัง success
    } catch (error: any) {
      console.error("Error creating zone type:", error);
      
      // Check for duplicate Zone Type Code error
      if (
          error?.message?.includes("Zone Type Code นี้ถูกใช้แล้ว") ||
          error?.response?.status === 409) {
        toast.error("Zone Type Code นี้ถูกใช้แล้ว");
      } else {
        toast.error("Failed to create zone type");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มข้อมูล Zone Temp"

      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-zone-type-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="add-zone-type-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="zone_type_code"
              placeholder="ID 2 Digits"
              value={formData.zone_type_code}
              onChange={handleChange}
              maxLength={2}
              pattern="\d{2}"
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>Full Name</label>
            <input
              type="text"
              name="full_name"
              placeholder="Full Name"
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
              placeholder="Short Name"
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
              placeholder="Remark"
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

export default AddZoneTypeModal;
