import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { locationApi } from "../services/location.api";
import { buildingApi } from "../../building/services/building.api";
import { zoneApi } from "../../zone/services/zone.api";
import { confirmAlert, successAlert } from "../../../utils/alert";
import "../../user/user.css";

import Select from "react-select";
import "../../../styles/component.css";

import type { BuildingType } from "../../building/types/building.type";
import type { ZoneType } from "../../zone/types/zone.type";

type AddLocationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type BuildingOption = {
  value: string;
  label: string;
};

type ZoneOption = {
  value: string;
  label: string;
};

const AddLocationModal = ({
  isOpen,
  onClose,
  onSuccess,
}: AddLocationModalProps) => {
  const [formData, setFormData] = useState({
    location_code: "",
    full_name: "",
    building_id: "",
    ncr_check: false,
    ignore: true,
    zone_id: "",
    lock_no: "",
    location_img: "",
    status: "Activate",
    remark: "",
  });

  const [loading, setLoading] = useState(false);

  const [buildingOptions, setBuildingOptions] = useState<BuildingOption[]>([]);
  const [_zoneOptions, setZoneOptions] = useState<ZoneOption[]>([]);
  const [filteredZoneOptions, setFilteredZoneOptions] = useState<ZoneOption[]>(
    [],
  );

  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [zones, setZones] = useState<ZoneType[]>([]);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  /* =========================
    Helpers
  ========================= */
  const isNormalNonTempZone = useCallback((z: ZoneType) => {
    const isNormal = z?.zone_type?.short_name === "Normal";
    const short = String(z?.short_name ?? "");
    const isTempSuffix = short.toLowerCase().endsWith("_temp");
    return isNormal && !isTempSuffix;
  }, []);

  /* =========================
    Load Buildings + Zones
  ========================= */
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        console.log("🔥 TEST CALL getAll locations...");
        const res = await locationApi.getAll();
        console.log("✅ getAll locations data:", res.data);
      } catch (err) {
        console.log("❌ getAll locations error:", err);
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    const fetchData = async () => {
      if (!isOpen) return;

      try {
        const [buildingsResponse, zonesResponse] = await Promise.all([
          buildingApi.getAll(),
          zoneApi.getAll(),
        ]);

        const buildingsData = buildingsResponse.data as BuildingType[];
        const zonesData = zonesResponse.data as ZoneType[];

        setBuildings(buildingsData);
        setZones(zonesData);

        setBuildingOptions(
          buildingsData.map((b) => ({
            value: String(b.id),
            label: `${b.short_name}`,
          })),
        );

        setZoneOptions(
          zonesData.map((z) => ({
            value: String(z.id),
            label:
              z.zone_type.short_name === "Normal"
                ? `${z.short_name}`
                : `${z.short_name}_${z.zone_type.short_name}`,
          })),
        );

        // เริ่มต้นไม่แสดง Zone ใดๆ จนกว่าจะเลือก Building
        setFilteredZoneOptions([]);

        // Auto-generate location_code
        const locationsResponse = await locationApi.getAll();
        const locations = (locationsResponse.data as any[]) || [];

        let newCode = "0001";
        if (locations && locations.length > 0) {
          const maxCode = locations.reduce((max, loc) => {
            const code = parseInt(loc.location_code || "0", 10);
            return code > max ? code : max;
          }, 0);
          const nextCode = maxCode + 1;
          newCode = nextCode.toString().padStart(4, "0");
        }

        setFormData((prev) => ({ ...prev, location_code: newCode }));
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to load data");
      }
    };

    fetchData();
  }, [isOpen]);

  /* =========================
    Filter Zone list
    ✅ NCR=false => เหมือนเดิม (เลือกได้ทุกประเภท)
    ✅ NCR=true  => เลือกได้เฉพาะ Normal และไม่ใช่ _temp
  ========================= */
  useEffect(() => {
    if (!isOpen) return;

    const buildingId = formData.building_id;
    if (!buildingId) {
      setFilteredZoneOptions([]);
      return;
    }

    const zonesInBuilding = zones.filter(
      (z) => String(z.building.id) === buildingId,
    );

    const list = formData.ncr_check
      ? zonesInBuilding.filter(isNormalNonTempZone)
      : zonesInBuilding;

    setFilteredZoneOptions(
      list.map((z) => ({
        value: String(z.id),
        label:
          formData.ncr_check === true
            ? `${z.short_name}`
            : z.zone_type.short_name === "Normal"
              ? `${z.short_name}`
              : `${z.short_name}_${z.zone_type.short_name}`,
      })),
    );
  }, [
    isOpen,
    formData.building_id,
    formData.ncr_check,
    zones,
    isNormalNonTempZone,
  ]);

  /* =========================
    Generate full_name
    ✅ NCR=false => เหมือนเดิม
    ✅ NCR=true  => Building + Zone(Normal) + Lock + _EXP&NCR
  ========================= */
  const generateFullName = useCallback(
    (
      buildingId: string,
      zoneId: string,
      lockNoRaw: string,
      ncrCheck: boolean,
    ) => {
      const building = buildings.find(
        (b) => String(b.id) === String(buildingId),
      );
      const zone = zones.find((z) => String(z.id) === String(zoneId));
      if (!building || !zone) return "";

      const lockNo = String(lockNoRaw ?? "").trim();

      // ✅ ถ้า EXP&NCR = true → ไม่ใช้ lock_no
      if (ncrCheck === true) {
        return `${building.short_name}_${zone.short_name}_EXP&NCR`;
      }

      // ✅ ถ้าไม่ใช่ NCR → ต้องมี lock_no และต้องไม่ใช่ "-"
      if (!lockNo || lockNo === "-") return "";

      if (zone.zone_type.short_name === "Normal") {
        return `${building.short_name}_${zone.short_name}_${lockNo}`;
      }

      return `${building.short_name}_${zone.short_name}_${lockNo}_${zone.zone_type.short_name}`;
    },
    [buildings, zones],
  );

  /* =========================
    Create next lock_no from getAll
  ========================= */
  const fetchNextLockNoFromGetAll = useCallback(
    async (buildingId: string, zoneId: string) => {
      try {
        const res = await locationApi.getAll();
        const locations = (res.data as any[]) || [];

        const sameGroup = locations.filter((loc) => {
          const bid = String(loc.building_id ?? loc.building?.id ?? "");
          const zid = String(loc.zone_id ?? loc.zone?.id ?? "");
          return bid === buildingId && zid === zoneId;
        });

        const max = sameGroup.reduce((acc, loc) => {
          const lockNoStr = String(loc.lock_no ?? "").trim();
          const n = parseInt(lockNoStr, 10);
          if (Number.isNaN(n)) return acc;
          return Math.max(acc, n);
        }, 0);

        const nextLockNo = String(max + 1).padStart(3, "0");
        setFormData((prev) => ({ ...prev, lock_no: nextLockNo }));
      } catch (error) {
        console.error("fetchNextLockNoFromGetAll error:", error);
        toast.error("ไม่สามารถสร้าง Lock No อัตโนมัติได้");
        setFormData((prev) => ({ ...prev, lock_no: "" }));
      }
    },
    [],
  );

  /* =========================
    Auto lock_no when building+zone ready
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    if (!formData.building_id || !formData.zone_id) return;

    // ✅ ถ้า EXP&NCR=true -> lock_no ต้องเป็น "-" และห้าม generate
    if (formData.ncr_check === true) {
      setFormData((prev) => ({ ...prev, lock_no: "-" }));
      return;
    }

    fetchNextLockNoFromGetAll(formData.building_id, formData.zone_id);
  }, [
    isOpen,
    formData.building_id,
    formData.zone_id,
    formData.ncr_check, // ✅ เพิ่ม dependency
    fetchNextLockNoFromGetAll,
  ]);

  /* =========================
    Auto full_name preview
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    if (!formData.building_id || !formData.zone_id) {
      setFormData((prev) => ({ ...prev, full_name: "" }));
      return;
    }

    // ✅ NCR=false เท่านั้นที่ต้องมี lock_no
    const lockNo = String(formData.lock_no ?? "").trim();
    if (formData.ncr_check !== true && !lockNo) {
      setFormData((prev) => ({ ...prev, full_name: "" }));
      return;
    }

    const fullName = generateFullName(
      formData.building_id,
      formData.zone_id,
      lockNo,
      formData.ncr_check,
    );

    setFormData((prev) => ({ ...prev, full_name: fullName }));
  }, [
    isOpen,
    formData.building_id,
    formData.zone_id,
    formData.lock_no,
    formData.ncr_check,
    generateFullName,
  ]);

  /* =========================
    Handle input change
  ========================= */
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name === "location_code") {
      const numericValue = value.replace(/\D/g, "");
      if (numericValue.length <= 4) {
        setFormData((prev) => ({ ...prev, [name]: numericValue }));
      }
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /* =========================
    Image upload
  ========================= */
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageFile(null);
  };

  const resetForm = () => {
    setFormData({
      location_code: "",
      full_name: "",
      building_id: "",
      ncr_check: false,
      ignore: false,
      zone_id: "",
      lock_no: "",
      location_img: "",
      status: "Activate",
      remark: "",
    });
    setImagePreview(null);
    setImageFile(null);
    setFilteredZoneOptions([]);
  };

  /* =========================
    Submit
  ========================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.location_code.length !== 4) {
      toast.error("ID must be exactly 4 digits");
      return;
    }

    if (!formData.building_id || !formData.zone_id) {
      toast.error("กรุณาเลือก Building และ Zone");
      return;
    }

    // const selectedZone = zones.find(
    //   (z) => String(z.id) === String(formData.zone_id),
    // );

    // บังคับ lock_no เฉพาะตอน NCR=false
    if (formData.ncr_check !== true) {
      const lockNo = String(formData.lock_no ?? "").trim();
      if (!lockNo || lockNo === "-") {
        toast.error("Lock No ยังไม่ถูกสร้างอัตโนมัติ");
        return;
      }
    }

    const result = await confirmAlert("");
    if (!result.isConfirmed) return;

    setLoading(true);

    try {
      const full_name = generateFullName(
        formData.building_id,
        formData.zone_id,
        formData.lock_no,
        formData.ncr_check,
      );

      if (!full_name) {
        toast.error(
          "ไม่สามารถสร้าง Full Name ได้ (ตรวจสอบข้อมูล Building/Zone/Lock No)",
        );
        return;
      }

      const submitData = {
        location_code: formData.location_code,
        full_name,
        building_id: parseInt(formData.building_id, 10),
        zone_id: parseInt(formData.zone_id, 10),
        lock_no:
          formData.ncr_check === true
            ? "-"
            : String(formData.lock_no ?? "").trim(),
        location_img: imageFile || "-",
        status: formData.status,
        ncr_check: formData.ncr_check,
        ignore: formData.ncr_check === true ? false : !formData.ignore,
        remark: formData.remark.trim() || "-",
      };

      await locationApi.create(submitData);

      await successAlert("Success!", "Location created successfully");
      onSuccess();
      resetForm();
      onClose();
    } catch (error: any) {
      console.error("Error creating location:", error);

      if (
        error?.message?.includes("Id นี้ถูกใช้แล้ว") ||
        error?.response?.status === 409
      ) {
        toast.error("Id นี้ถูกใช้แล้ว");
      } else {
        toast.error("Failed to create location");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="เพิ่มข้อมูล Location"
      footer={
        <>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => {
              resetForm();
              onClose();
            }}
          >
            Cancel
          </button>

          <button
            type="submit"
            form="add-location-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="add-location-form" onSubmit={handleSubmit}>
        {/* ID */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="location_code"
              value={formData.location_code}
              onChange={handleChange}
              required
              placeholder="Auto Generated"
              disabled
            />
          </div>
        </div>

        {/* Full Name Preview */}
        <div className="form-row">
          <div className="form-group form-group-full disabled">
            <label>
              Full Name <span className="required">*</span>
            </label>
            <input
              type="text"
              name="full_name"
              placeholder="Building + Zone + Lock No."
              value={formData.full_name}
              disabled
            />
          </div>
        </div>

        {/* Building */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Building <span className="required">*</span>
            </label>

            <Select
              className="select"
              classNamePrefix="select"
              options={buildingOptions}
              value={
                buildingOptions.find((o) => o.value === formData.building_id) ||
                null
              }
              onChange={(selectedOption) => {
                const buildingId =
                  (selectedOption as BuildingOption | null)?.value || "";

                setFormData((prev) => ({
                  ...prev,
                  building_id: buildingId,
                  zone_id: "",
                  lock_no: prev.ncr_check === true ? "-" : "",
                  full_name: "",
                }));
              }}
              placeholder="Select Building"
              isSearchable
            />
          </div>
        </div>

        {/* EXP&NCR */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label className="toggle-label" htmlFor="ncr-toggle">
              EXP&NCR <span className="required">*</span>
            </label>

            <div className="toggle-wrap">
              <label className="toggle-switch">
                <input
                  id="ncr-toggle"
                  type="checkbox"
                  checked={formData.ncr_check === true}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setFormData((prev) => ({
                      ...prev,
                      ncr_check: next,
                      ignore: next ? false : prev.ignore,
                      lock_no: next ? "-" : "", // ✅ ถ้าติ๊ก → เป็น "-"
                      full_name: "",
                    }));
                  }}
                />
                <span className="toggle-slider">
                  <span className="toggle-text">
                    {formData.ncr_check === true ? "EXP&NCR" : ""}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Ignore */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label className="toggle-label" htmlFor="ignore-toggle">
              การควบคุมอุณหภูมิ <span className="required">*</span>
            </label>

            <div className="toggle-wrap">
              <label className="toggle-switch">
                <input
                  id="ignore-toggle"
                  type="checkbox"
                  checked={formData.ignore === true}
                  disabled={formData.ncr_check === true}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setFormData((prev) => ({
                      ...prev,
                      ignore: next,
                      full_name: "",
                    }));
                  }}
                />
                <span className="toggle-slider">
                  <span className="toggle-text">
                    {formData.ncr_check === true
                      ? ""
                      : formData.ignore === true
                        ? "ใช่"
                        : ""}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Zone */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Zone <span className="required">*</span>
            </label>

            <Select
              className="select"
              classNamePrefix="select"
              options={filteredZoneOptions}
              value={
                filteredZoneOptions.find((o) => o.value === formData.zone_id) ||
                null
              }
              onChange={(selectedOption) => {
                const zoneId =
                  (selectedOption as ZoneOption | null)?.value || "";

                setFormData((prev) => ({
                  ...prev,
                  zone_id: zoneId,
                  lock_no: prev.ncr_check === true ? "-" : "", // ✅
                  full_name: "",
                }));
              }}
              placeholder={
                formData.building_id ? "Select Zone" : "Select Building First"
              }
              isSearchable
              isDisabled={!formData.building_id}
            />
          </div>
        </div>

        {/* Lock No */}
        <div className="form-row">
          <div className="form-group form-group-full ">
            <label>
              Lock No. <span className="required">*</span>
            </label>
            <input
              type="text"
              name="lock_no"
              placeholder="Lock No."
              value={formData.lock_no}
              onChange={handleChange}
              required={formData.ncr_check !== true}
              disabled={formData.ncr_check === true}
            />
          </div>
        </div>

        {/* Image */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>รูปภาพ</label>

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
                <label htmlFor="location-image" className="image-upload-label">
                  <div className="upload-placeholder">
                    <span className="upload-icon">📷</span>
                    <span className="upload-text">Click to upload image</span>
                    <span className="upload-hint">PNG, JPG (max 5MB)</span>
                  </div>
                </label>
              )}

              <input
                type="file"
                id="location-image"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: "none" }}
              />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label className="toggle-label" htmlFor="status-toggle">
              Status <span className="required">*</span>
            </label>

            <div className="toggle-wrap">
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
        </div>

        {/* Remark */}
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

export default AddLocationModal;
