import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { userApi } from "../services/user.api";
import { departmentApi } from "../../department/services/department.api";

import { warningAlert, successAlert } from "../../../utils/alert";

import Select from "react-select";

import "../../../styles/component.css";

// ✅ import type นี้จากไฟล์ที่ประกาศไว้จริง
import type { UserUpdateData } from "../types/user.type";

type EditUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: number;
};

type DepartmentOption = {
  value: number;
  label: string;
};

const EditUserModal = ({
  isOpen,
  onClose,
  onSuccess,
  userId,
}: EditUserModalProps) => {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    tel: "",
    username: "",
    user_level: "",
    department_ids: [] as DepartmentOption[],
    user_img: "",
    status: "Activate",
    remark: "",
  });

  const [loading, setLoading] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState<
    DepartmentOption[]
  >([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    const fetchDepartments = async () => {
      if (!isOpen) return;

      try {
        const response = await departmentApi.getAll();
        const departments = Array.isArray(response.data)
          ? response.data
          : response.data.data || [];

        const options = departments.map(
          (dept: { id: number; short_name: string }) => ({
            value: dept.id,
            label: dept.short_name,
          })
        );

        setDepartmentOptions(options);
      } catch (error) {
        console.error("Failed to fetch departments:", error);
        toast.error("Failed to fetch departments");
      }
    };

    fetchDepartments();
  }, [isOpen]);

  const fetchUserDetails = async (id: number) => {
    try {
      setImagePreview(null);
      setImageFile(null);

      const response = await userApi.getById(id);
      const user = response.data as any;

      if (!user || !user.id) {
        throw new Error("Invalid user data");
      }

      let departmentOptions: DepartmentOption[] = [];
      if (user.departments && Array.isArray(user.departments)) {
        departmentOptions = user.departments.map((dept: any) => ({
          value: parseInt(dept.id),
          label: dept.short_name,
        }));
      }

      setFormData({
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        tel: user.tel,
        username: user.username,
        password: "",
        user_level: user.user_level,
        department_ids: departmentOptions,
        user_img: user.user_img || "",
        status: user.status,
        remark: user.remark || "",
      });

      if (user.user_img) {
        setImagePreview(user.user_img);
      }
    } catch (error) {
      console.error("Failed to fetch user details:", error);
      toast.error("Failed to fetch user details");
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserDetails(userId);
    }
  }, [isOpen, userId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageFile(null);

    setFormData((prev) => ({
      ...prev,
      user_img: "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await warningAlert("");
    if (!result.isConfirmed) return;

    setLoading(true);

    try {
      // ✅ ใช้ type ตรงกับ userApi.update
      const submitData: UserUpdateData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        tel: formData.tel,
        username: formData.username,
        user_level: formData.user_level,
        department_ids: formData.department_ids.map((dept) => dept.value),
        user_img: imageFile ?? formData.user_img,
        status: formData.status,
        remark: formData.remark.trim() || "-",
      };

      // ✅ เพิ่ม password แบบ conditional
      if (formData.password.trim()) {
        submitData.password = formData.password;
      }

      await userApi.update(userId, submitData);
      await successAlert("Success!", "User updated successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Failed to update user");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล User"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="edit-user-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={handleSubmit}>
        <div className="form-row form-row-2col">
          <div className="form-group">
            <label>
              ชื่อ <span className="required">*</span>
            </label>
            <input
              type="text"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>
              นามสกุล <span className="required">*</span>
            </label>
            <input
              type="text"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Email <span className="required">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>Tel. <span className="required">*</span></label>
            <input
              type="text"
              name="tel"
              value={formData.tel}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/\D/g, "");
                if (numericValue.length <= 10) {
                  setFormData((prev) => ({ ...prev, tel: numericValue }));
                }
              }}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Username <span className="required">*</span>
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
            />
          </div>
        </div>
           <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Password{" "}
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="...เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยนรหัสผ่าน"
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              User Level <span className="required">*</span>
            </label>
            <Select
              className="select"
              classNamePrefix="select"
              options={[
                { value: "Admin", label: "Admin" },
                { value: "Operator", label: "Operator" },
                { value: "Supervisor", label: "Supervisor" },
              ]}
              value={
                formData.user_level
                  ? {
                      value: formData.user_level,
                      label: formData.user_level,
                    }
                  : null
              }
              onChange={(selectedOption) =>
                setFormData((prev) => ({
                  ...prev,
                  user_level: selectedOption ? selectedOption.value : "",
                }))
              }
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Departments <span className="required">*</span>
            </label>
            <Select
              className="select"
              classNamePrefix="select"
              options={departmentOptions}
              isMulti
              value={formData.department_ids}
              onChange={(selectedOptions) =>
                setFormData((prev) => ({
                  ...prev,
                  department_ids: selectedOptions as DepartmentOption[],
                }))
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Profile Image
            </label>
            <div className="image-upload-container">
              {imagePreview ? (
                <div className="image-preview-wrapper">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="image-preview"
                  />
                  <button
                    type="button"
                    className="btn-remove-image"
                    onClick={handleRemoveImage}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label htmlFor="user-image" className="image-upload-label">
                  <div className="upload-placeholder">
                    <span className="upload-icon">📷</span>
                    <span className="upload-text">Click to upload image</span>
                    {/* <span className="upload-hint">PNG, JPG (max 5MB)</span> */}
                  </div>
                </label>
              )}
              <input
                type="file"
                id="user-image"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: "none" }}
              />
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label className="toggle-label" htmlFor="status-toggle">
              Status <span className="required">*</span>
            </label>

            <label className="toggle-switch">
              <input
                id="status-toggle"
                type="checkbox"
                checked={formData.status === "Activate"}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.checked ? "Activate" : "Deactivate",
                  }))
                }
              />

              <span className="toggle-slider">
                <span className="toggle-text">
                  {formData.status === "Activate" ? "ACTIVATE" : ""}
                </span>
              </span>
            </label>
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
export default EditUserModal;
