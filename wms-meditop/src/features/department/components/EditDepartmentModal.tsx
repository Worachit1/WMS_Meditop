import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { departmentApi } from "../services/department.api";

import {
  warningAlert,
  successAlert,
} from "../../../utils/alert";

type EditDepartmentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  departmentId: number;
};

const EditDepartmentModal = ({
  isOpen,
  onClose,
  onSuccess,
  departmentId,
}: EditDepartmentModalProps) => {
  const [formData, setFormData] = useState({
    department_code: "",
    full_name: "",
    short_name: "",
    remark: "",
  });

  const [loading, setLoading] = useState(false);

  const fetchDepartmentDetails = async (id: number) => {
    try {
      const response = await departmentApi.getById(id);
      console.log("Response:", response.data);

      // API returns the department object directly in response.data
      const department = response.data as any;

      if (!department || !department.id) {
        throw new Error("Department not found");
      }

      setFormData({
        department_code: department.department_code,
        full_name: department.full_name,
        short_name: department.short_name,
        remark: department.remark || "",
      });
    } catch (error) {
      console.error("Failed to fetch department details:", error);
      toast.error("Failed to fetch department details");
    }
  };

  useEffect(() => {
    if (isOpen && departmentId) {
      fetchDepartmentDetails(departmentId);
    }
  }, [isOpen, departmentId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    if (name === "department_code") {
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

    if (formData.department_code.length !== 2) {
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
        department_code: formData.department_code,
        full_name: formData.full_name,
        short_name: formData.short_name,
        remark: formData.remark.trim() || "-",
      };
      await departmentApi.update(departmentId, submitData);
      
      // Show success alert
      await successAlert("Success!", "Department updated successfully");
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to update department:", error);
      toast.error("Failed to update department");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล Department"
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
              ID<span className="required">*</span>
            </label>
            <input
              type="text"
              name="department_code"
              value={formData.department_code}
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

export default EditDepartmentModal;
