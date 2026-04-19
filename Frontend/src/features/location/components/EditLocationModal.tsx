import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { locationApi } from "../services/location.api";
import { buildingApi } from "../../building/services/building.api";
import { zoneApi } from "../../zone/services/zone.api";
import { warningAlert, successAlert } from "../../../utils/alert";
import "../../user/user.css";

import Select from "react-select";

import "../../../styles/component.css";
import type { BuildingType } from "../../building/types/building.type";
import type { ZoneType } from "../../zone/types/zone.type";

type EditLocationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locationId: number;
};

type BuildingOption = {
  value: string;
  label: string;
};

type ZoneOption = {
  value: string;
  label: string;
};

const EditLocationModal = ({
  isOpen,
  onClose,
  onSuccess,
  locationId,
}: EditLocationModalProps) => {
  const [formData, setFormData] = useState({
    location_code: "",
    full_name: "",
    building_id: "",
    zone_id: "",
    lock_no: "",
    location_img: "",
    status: "Activate",
    ncr_check: false,
    ignore: false,
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

  // ✅ เก็บค่า building_id และ zone_id เดิม เพื่อตรวจสอบว่ามีการเปลี่ยนแปลงหรือไม่
  const [originalBuildingId, setOriginalBuildingId] = useState("");
  const [originalZoneId, setOriginalZoneId] = useState("");

  const [hydrated, setHydrated] = useState(false);

  const pad2 = (v: any) => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(String(v).trim());
    if (Number.isNaN(n)) return String(v).trim();
    return String(n).padStart(2, "0"); // 2 หลัก: "02", "10"
  };

  const pad3 = (v: any) => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(String(v).trim());
    if (Number.isNaN(n)) return String(v).trim();
    return String(n).padStart(3, "0"); // 3 หลัก: "001", "010", "100"
  };

  /* =========================
    Helpers
  ========================= */
  // ✅ ใช้เฉพาะตอน NCR=true เท่านั้น (Normal + ไม่ _temp)
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
    const fetchData = async () => {
      if (!isOpen) return;

      try {
        const buildingsResponse = await buildingApi.getAll();
        const buildingsData = buildingsResponse.data as BuildingType[];
        setBuildings(buildingsData);
        setBuildingOptions(
          buildingsData.map((b) => ({
            value: pad2(b.id), // ✅ "02"
            label: b.short_name,
          })),
        );

        const zoneResponse = await zoneApi.getAll();
        const zonesData = zoneResponse.data as ZoneType[];
        setZones(zonesData);
        setZoneOptions(
          zonesData.map((z) => ({
            value: pad3(z.id), // ✅ "001"
            label:
              z.zone_type.short_name === "Normal"
                ? z.short_name
                : `${z.short_name}_${z.zone_type.short_name}`,
          })),
        );
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to load data");
      }
    };

    fetchData();
  }, [isOpen]);

  /* =========================
    Generate full_name
    ✅ Edit มี pad ("02"/"003") => ต้อง parseInt ก่อนหาใน array
    ✅ NCR=false => เหมือนเดิม
    ✅ NCR=true  => Building + Zone + _EXP&NCR (ไม่ใส่ lock_no)
  ========================= */
  const generateFullName = useCallback(
    (
      buildingId: string,
      zoneId: string,
      lockNoRaw: string,
      ncrCheck: boolean,
    ) => {
      const bId = parseInt(String(buildingId ?? ""), 10);
      const zId = parseInt(String(zoneId ?? ""), 10);

      const building = buildings.find((b) => Number(b.id) === bId);
      const zone = zones.find((z) => Number(z.id) === zId);

      if (!building || !zone) return "";

      const lockNo = String(lockNoRaw ?? "").trim();

      // ✅ ถ้า EXP&NCR = true → ไม่ใช้ lock_no (แต่ lock_no ในฟอร์มจะเป็น "-")
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
    ✅ ใช้ building_id + zone_id ตรง ๆ
    ⚠️ Edit: building_id/zone_id เป็น pad ("02"/"003") แต่ API มักเป็น "2"/"3"
        => normalize เป็นตัวเลข string ให้เหมือนกันก่อนเทียบ
  ========================= */
  const fetchNextLockNoFromGetAll = useCallback(
    async (buildingId: string, zoneId: string) => {
      try {
        const res = await locationApi.getAll();
        const locations = (res.data as any[]) || [];

        const bKey = String(parseInt(String(buildingId ?? ""), 10)); // "02" -> "2"
        const zKey = String(parseInt(String(zoneId ?? ""), 10)); // "003" -> "3"

        const sameGroup = locations.filter((loc) => {
          const bid = String(loc.building_id ?? loc.building?.id ?? "");
          const zid = String(loc.zone_id ?? loc.zone?.id ?? "");
          return bid === bKey && zid === zKey;
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
    Auto lock_no when building+zone changed
    ✅ อย่า regen ตอนเปิดครั้งแรก
    ✅ ถ้า ncr=true -> lock_no = "-"
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    if (!hydrated) return;
    if (!formData.building_id || !formData.zone_id) return;

    // ✅ ncr=true -> lock_no = "-" เสมอ และไม่ generate
    if (formData.ncr_check === true) {
      if (formData.lock_no !== "-") {
        setFormData((prev) => ({ ...prev, lock_no: "-" }));
      }
      return;
    }

    // ✅ กัน regen ตอนเปิดครั้งแรก (ยังไม่เปลี่ยนจากค่าเดิม)
    if (
      formData.building_id === originalBuildingId &&
      formData.zone_id === originalZoneId
    ) {
      return;
    }

    fetchNextLockNoFromGetAll(formData.building_id, formData.zone_id);
  }, [
    isOpen,
    hydrated,
    formData.building_id,
    formData.zone_id,
    formData.ncr_check,
    formData.lock_no,
    originalBuildingId,
    originalZoneId,
    fetchNextLockNoFromGetAll,
  ]);

  /* =========================
    Auto full_name preview
    ✅ ncr=true ไม่ต้องมี lock_no
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    if (!hydrated) return;
    if (buildings.length === 0 || zones.length === 0) return;

    if (!formData.building_id || !formData.zone_id) {
      setFormData((prev) => ({ ...prev, full_name: "" }));
      return;
    }

    const lockNo = String(formData.lock_no ?? "").trim();

    // ✅ ncr=false เท่านั้นที่ต้องมี lock_no จริง
    if (formData.ncr_check !== true && (!lockNo || lockNo === "-")) {
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
    hydrated,
    buildings,
    zones,
    formData.building_id,
    formData.zone_id,
    formData.lock_no,
    formData.ncr_check,
    generateFullName,
  ]);

  /* =========================
    Fetch location details
    ✅ กัน effect ทับค่าเดิมด้วย hydrated
  ========================= */
  const fetchLocationDetails = async (id: string) => {
    try {
      setHydrated(false);

      const response = await locationApi.getById(parseInt(id, 10));
      const location = response.data as any;
      if (!location || !location.id) throw new Error("Invalid location data");

      const buildingId = pad2(
        location.building_id ?? location.building?.id ?? "",
      );
      const zoneId = pad3(location.zone_id ?? location.zone?.id ?? "");
      const ncr = Boolean(location.ncr_check ?? false);

      setFormData({
        location_code: String(location.location_code ?? ""),
        full_name: String(location.full_name ?? ""), // ✅ show original immediately
        building_id: buildingId,
        zone_id: zoneId,
        lock_no: ncr ? "-" : String(location.lock_no ?? ""), // ✅ ncr=true -> "-"
        location_img: String(location.location_img ?? ""),
        status: String(location.status ?? ""),
        ncr_check: ncr,
        ignore: ncr ? false : !Boolean(location.ignore ?? false),
        remark: String(location.remark ?? ""),
      });

      setOriginalBuildingId(buildingId);
      setOriginalZoneId(zoneId);

      if (location.location_img) setImagePreview(location.location_img);

      setHydrated(true);
    } catch (error) {
      console.error("Failed to fetch location details:", error);
      toast.error("Failed to fetch location details");
      setHydrated(true);
    }
  };

  useEffect(() => {
    if (isOpen && locationId) {
      fetchLocationDetails(String(locationId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, locationId]);

  /* =========================
    Filter zones when building_id / ncr_check / zones change
    ✅ NCR=false => ทุกประเภท
    ✅ NCR=true  => เฉพาะ Normal + ไม่ _temp
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    if (!formData.building_id || zones.length === 0) return;

    const buildingIdNum = parseInt(formData.building_id, 10);
    const zonesInBuilding = zones.filter(
      (z) => z.building.id === buildingIdNum,
    );

    const list = formData.ncr_check
      ? zonesInBuilding.filter(isNormalNonTempZone)
      : zonesInBuilding;

    setFilteredZoneOptions(
      list.map((z) => ({
        value: pad3(z.id),
        label:
          formData.ncr_check === true
            ? z.short_name
            : z.zone_type.short_name === "Normal"
              ? z.short_name
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
    หากเปิด NCR=true แล้ว zone เดิมไม่ผ่านเงื่อนไข -> reset zone/lock/full_name
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    if (formData.ncr_check !== true) return;
    if (!formData.zone_id) return;
    if (zones.length === 0) return;

    const zid = parseInt(formData.zone_id, 10);
    const z = zones.find((x) => x.id === zid);

    if (z && !isNormalNonTempZone(z)) {
      toast.info(
        "เปิด NCR แล้ว ต้องเลือก Zone แบบ Normal (และไม่ใช่ _temp) เท่านั้น",
      );
      setFormData((prev) => ({
        ...prev,
        zone_id: "",
        lock_no: "-",
        full_name: "",
      }));
    }
  }, [
    isOpen,
    formData.ncr_check,
    formData.zone_id,
    zones,
    isNormalNonTempZone,
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

    // ✅ (Optional) กัน space แปลก ๆ ใน lock_no
    if (name === "lock_no") {
      setFormData((prev) => ({ ...prev, lock_no: value.trim() }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.location_code.length !== 4) {
      toast.error("Location Code must be exactly 4 digits");
      return;
    }

    if (!formData.building_id || !formData.zone_id) {
      toast.error("กรุณาเลือก Building และ Zone");
      return;
    }

    const selectedZone = zones.find(
      (z) => z.id === parseInt(formData.zone_id, 10),
    );

    // ✅ บังคับเฉพาะตอน NCR=true
    if (formData.ncr_check === true) {
      if (!selectedZone) {
        toast.error("กรุณาเลือก Zone");
        return;
      }
      if (!isNormalNonTempZone(selectedZone)) {
        toast.error(
          "เมื่อเปิด NCR Check จะเลือกได้เฉพาะ Zone ที่เป็น Normal และไม่ใช่ _temp เท่านั้น",
        );
        return;
      }
    }

    // ✅ บังคับ lock_no เฉพาะตอน ncr=false
    if (formData.ncr_check !== true) {
      const lockNo = String(formData.lock_no ?? "").trim();
      if (!lockNo || lockNo === "-") {
        toast.error("กรุณาระบุ Lock No.");
        return;
      }
    }

    const result = await warningAlert("");
    if (!result.isConfirmed) return;

    setLoading(true);

    try {
      const lockNo = String(formData.lock_no ?? "").trim();
      const full_name = generateFullName(
        formData.building_id,
        formData.zone_id,
        lockNo,
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
        lock_no: formData.ncr_check === true ? "-" : lockNo,
        location_img: imageFile || formData.location_img || "-",
        status: formData.status,
        ncr_check: formData.ncr_check,
        ignore: formData.ncr_check === true ? false : !formData.ignore,
        remark: formData.remark.trim() || "-",
      };

      await locationApi.update(locationId, submitData);
      await successAlert("Success!", "Location updated successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating location:", error);
      toast.error("Failed to update location");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล Location"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="edit-location-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-location-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="location_code"
              placeholder="ID 4 Digits"
              value={formData.location_code}
              onChange={handleChange}
              required
              disabled
            />
          </div>
        </div>

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
              onChange={handleChange}
              disabled
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              Building <span className="required">*</span>
            </label>
            <Select
              className="select"
              classNamePrefix="select"
              options={buildingOptions}
              onChange={(selectedOption) => {
                const buildingId =
                  (selectedOption as BuildingOption)?.value || "";
                setFormData((prev) => ({
                  ...prev,
                  building_id: buildingId,
                  zone_id: "",
                  lock_no: prev.ncr_check === true ? "-" : "",
                  full_name: "",
                }));
              }}
              value={buildingOptions.find(
                (option) => option.value === formData.building_id,
              )}
              placeholder="Select Building"
              isSearchable
              required
            />
          </div>
        </div>

        {/* EXP&NCR */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label className="toggle-label" htmlFor="ncr-toggle">
              EXP&NCR<span className="required">*</span>
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
                      lock_no: next ? "-" : "",
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

        {/* Ignore Temperature */}
        <div className="form-row">
          <div className="form-group form-group-full">
            <label className="toggle-label" htmlFor="ignore-toggle">
              การควบคุมอุณหภูมิ<span className="required">*</span>
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
              onChange={(selectedOption) =>
                setFormData((prev) => ({
                  ...prev,
                  zone_id: (selectedOption as ZoneOption)?.value || "",
                  lock_no: prev.ncr_check === true ? "-" : "",
                  full_name: "",
                }))
              }
              value={filteredZoneOptions.find(
                (option) => option.value === formData.zone_id,
              )}
              placeholder={
                formData.building_id ? "Select Zone" : "Select Building First"
              }
              isSearchable
              isDisabled={!formData.building_id}
              required
            />
          </div>
        </div>

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
              disabled={formData.ncr_check === true}
              required={formData.ncr_check !== true}
            />
          </div>
        </div>

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

export default EditLocationModal;