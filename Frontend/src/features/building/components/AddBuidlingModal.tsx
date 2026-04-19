import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { buildingApi } from "../services/building.api";
import { confirmAlert, successAlert } from "../../../utils/alert";

type AddBuildingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const AddBuildingModal = ({
  isOpen,
  onClose,
  onSuccess,
}: AddBuildingModalProps) => {
  const [formData, setFormData] = useState({
    building_code: "",
    full_name: "",
    short_name: "",
    remark: "",
  });

  const [loading, setLoading] = useState(false);

  // Auto-generate building_code
  useEffect(() => {
    const generateBuildingCode = async () => {
      if (!isOpen) return;

      try {
        const response = await buildingApi.getAll();
        const buildings = response.data as any[];

        let newCode = "01";
        if (buildings && buildings.length > 0) {
          // หา building_code ที่ใหญ่ที่สุด
          const maxCode = buildings.reduce((max, building) => {
            const code = parseInt(building.building_code || "0");
            return code > max ? code : max;
          }, 0);
          const nextCode = maxCode + 1;
          newCode = nextCode.toString().padStart(2, "0");
        }

        setFormData((prev) => ({ ...prev, building_code: newCode }));
      } catch (error) {
        console.error("Failed to generate building code:", error);
        toast.error("Failed to generate building code");
      }
    };

    generateBuildingCode();
  }, [isOpen]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    // Validate building_code field - only allow 2 digits
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

    // Validate building_code
    if (formData.building_code.length !== 2) {
      toast.error("Building Code must be exactly 2 digits");
      return;
    }

    const result = await confirmAlert("");
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

      await buildingApi.create(submitData);

      setFormData({ building_code: "", full_name: "", short_name: "", remark: "" });
      await successAlert("Success!", "Building created successfully");
      onSuccess();
      onClose(); // ✅ ปิด modal หลัง success
    } catch (error: any) {
      console.error("Error creating building:", error);
      
      // Check for duplicate building_code error
      if (
          error?.message?.includes("Building Code นี้ถูกใช้แล้ว") ||
          error?.response?.status === 409) {
        toast.error("Building Code นี้ถูกใช้แล้ว");
      } else {
        toast.error("Failed to create building");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มข้อมูล Building"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-building-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="add-building-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full disabled">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="building_code"
              placeholder="Auto Generated"
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

export default AddBuildingModal;
