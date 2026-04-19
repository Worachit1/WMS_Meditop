import { useState } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { departmentApi } from "../services/department.api";
import { confirmAlert, successAlert } from "../../../utils/alert";

type AddDepartmentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const AddDepartmentModal = ({
  isOpen,
  onClose,
  onSuccess,
}: AddDepartmentModalProps) => {
  const [formData, setFormData] = useState({
    id: "",
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
    if (name === "id") {
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
    if (formData.id.length !== 2) {
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
        id: formData.id,
        full_name: formData.full_name,
        short_name: formData.short_name,
        remark: formData.remark.trim() || "-",
      };

      await departmentApi.create(submitData);

      setFormData({ id: "", full_name: "", short_name: "", remark: "" });
      await successAlert("Success!", "Department created successfully");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error creating department:", error);
      
      // Check for duplicate ID error
      if (
          error?.message?.includes("Id นี้ถูกใช้แล้ว") ||
          error?.response?.status === 409) {
        toast.error("Id นี้ถูกใช้แล้ว");
      } else {
        toast.error("Failed to create department");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มข้อมูล Department"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-department-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="add-department-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="id"
              placeholder="ID 2 Digits"
              value={formData.id}
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

export default AddDepartmentModal;
