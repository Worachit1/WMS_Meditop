import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { zoneApi } from "../services/zone.api";
import { locationApi } from "../../location/services/location.api";

import { warningAlert, successAlert } from "../../../utils/alert";
import type { ZoneType_Type } from "../../zone_type/types/zone_type.type";
import type { BuildingType } from "../../building/types/building.type";
import { zoneTypeApi } from "../../zone_type/services/zone_type.api";
import { buildingApi } from "../../building/services/building.api";
import Select from "react-select";

import "../../../index.css";

type EditZoneModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zoneId: number;
};

type buildingOption = {
  value: string;
  label: string;
};
type zoneTypeOption = {
  value: string;
  label: string;
};

const EditZoneModal = ({
  isOpen,
  onClose,
  onSuccess,
  zoneId,
}: EditZoneModalProps) => {
  const [formData, setFormData] = useState({
    zone_code: "",
    full_name: "",
    short_name: "",
    building_id: "",
    zone_type_id: "",
    remark: "",
  });

  const [loading, setLoading] = useState(false);
  const [buildingOptions, setBuildingOptions] = useState<buildingOption[]>([]);
  const [zoneTypeOptions, setZoneTypeOptions] = useState<zoneTypeOption[]>([]);
  const [allZones, setAllZones] = useState<any[]>([]);
  const [originalZoneTypeId, setOriginalZoneTypeId] = useState("");

  const [_allZoneTypes, setAllZoneTypes] = useState<ZoneType_Type[]>([]);
  const [originalShortName, setOriginalShortName] = useState("");
  const [allLocations, setAllLocations] = useState<any[]>([]);

  const pickArray = (respData: any): any[] => {
    if (Array.isArray(respData)) return respData;
    if (Array.isArray(respData?.data)) return respData.data;
    if (Array.isArray(respData?.data?.data)) return respData.data.data;
    return [];
  };

  const getZoneBuildingId = (zone: any) =>
    String(zone?.building_id ?? zone?.building?.id ?? zone?.buildingId ?? "");

  const getZoneTypeId = (zone: any) =>
    String(
      zone?.zone_type_id ??
        zone?.zone_type?.id ??
        zone?.zoneTypeId ??
        zone?.zone_typeId ??
        "",
    );

  const getZoneId = (zone: any) => String(zone?.id ?? zone?.zone_id ?? "");

  const getAvailableZoneTypeOptions = (buildingId: string) => {
    if (!buildingId) return [];

    const usedZoneTypeIds = new Set(
      allZones
        .filter((zone: any) => {
          const sameBuilding = getZoneBuildingId(zone) === String(buildingId);
          const isCurrentZone = getZoneId(zone) === String(zoneId);

          // ✅ edit ต้องยกเว้น record ตัวเอง
          return sameBuilding && !isCurrentZone;
        })
        .map((zone: any) => getZoneTypeId(zone))
        .filter(Boolean),
    );

    return zoneTypeOptions.filter((option) => {
      const optionId = String(option.value);

      // ✅ ค่าเดิมของตัวเองต้องยังเห็นเสมอ
      if (optionId === String(originalZoneTypeId)) return true;

      return !usedZoneTypeIds.has(optionId);
    });
  };

  // Fetch buildings, zone types และ generate ID
  useEffect(() => {
    const fetchData = async () => {
      if (!isOpen) return;

      try {
        // Fetch buildings
        const buildingsResponse = await buildingApi.getAll();
        const buildings = buildingsResponse.data as BuildingType[];
        setBuildingOptions(
          buildings.map((building) => ({
            value: building.id.toString(),
            label: `${building.short_name}`,
          })),
        );

        // Fetch zone types
        const zoneTypesResponse = await zoneTypeApi.getAll();
        const zoneTypes = pickArray(zoneTypesResponse.data) as ZoneType_Type[];

        setAllZoneTypes(zoneTypes);
        setZoneTypeOptions(
          zoneTypes.map((type) => ({
            value: String(type.id),
            label: String(type.short_name ?? type.id),
          })),
        );

        const zonesResponse = await zoneApi.getAll();
        const zones = pickArray(zonesResponse.data);
        setAllZones(zones);

        // Fetch all locations for validation
        const locationsResponse = await locationApi.getAll();
        const locations = locationsResponse.data as any[];
        setAllLocations(locations);
      } catch (error) {
        console.error("Failed to fetch buildings or zone types:", error);
        toast.error("Failed to fetch buildings or zone types");
      }
    };

    fetchData();
  }, [isOpen]);

  const fetchZoneDetails = async (id: number) => {
    try {
      const response = await zoneApi.getById(id);
      const zone = response.data as any;

      if (!zone || !zone.zone_code) {
        throw new Error("Invalid zone data");
      }

      const buildingId = zone.building?.id?.toString() || "";
      const zoneTypeId = zone.zone_type?.id?.toString() || "";

      setFormData({
        zone_code: zone.zone_code,
        full_name: zone.full_name,
        short_name: zone.short_name,
        building_id: buildingId,
        zone_type_id: zoneTypeId,
        remark: zone.remark || "",
      });

      // เก็บ original zone type id และ short name
      setOriginalZoneTypeId(zoneTypeId);
      setOriginalShortName(zone.short_name);
    } catch (error) {
      console.error("Failed to fetch zone details:", error);
      toast.error("Failed to fetch zone details");
    }
  };

  useEffect(() => {
    if (isOpen && zoneId) {
      fetchZoneDetails(zoneId);
    }
  }, [isOpen, zoneId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;

    // Validate zone_code field - only allow 3 digits
    if (name === "zone_code") {
      const numericValue = value.replace(/\D/g, ""); // Remove non-digits
      if (numericValue.length <= 3) {
        setFormData((prev) => ({ ...prev, [name]: numericValue }));
      }
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate zone_code
    if (formData.zone_code.length !== 3) {
      toast.error("Zone Code must be exactly 3 digits");
      return;
    }

    // ✅ ตรวจสอบว่ามีการเปลี่ยน short_name หรือไม่
    if (formData.short_name !== originalShortName) {
      // ตรวจสอบว่ามี Location ที่ใช้ Zone นี้อยู่หรือไม่
      const locationsUsingThisZone = allLocations.filter((loc) => {
        const locZoneId = String(loc.zone_id ?? loc.zone?.id ?? "");
        return locZoneId === String(zoneId);
      });

      if (locationsUsingThisZone.length > 0) {
        toast.error(
          `ไม่สามารถแก้ไข Zone Name ได้ เนื่องจากมี Location ${locationsUsingThisZone.length} รายการที่ใช้ Zone นี้อยู่ กรุณาแก้ไข Location ก่อน`,
          { autoClose: 5000 },
        );
        return;
      }
    }

    // Show confirmation alert
    const result = await warningAlert("");

    if (!result.isConfirmed) {
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        zone_code: formData.zone_code,
        full_name: formData.full_name,
        short_name: formData.short_name,
        building_id: parseInt(formData.building_id),
        zone_type_id: parseInt(formData.zone_type_id),
        remark: formData.remark.trim() || "-",
      };
      await zoneApi.update(zoneId, submitData);

      // Show success alert
      await successAlert("Success!", "Zone updated successfully");

      onSuccess();
      onClose();
    } catch (error: any) {
      // Get error message from backend
      const backendMessage =
        error?.message ||
        (typeof error?.response?.data === "string"
          ? error?.response?.data
          : null);

      // Display error message from backend or default message
      if (
        backendMessage &&
        backendMessage !== "Request failed with status code 400"
      ) {
        toast.error(backendMessage);
      } else {
        toast.error("Failed to create zone");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล Zone"
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
              name="zone_code"
              placeholder="Zone Code 3 Digits"
              value={formData.zone_code}
              onChange={handleChange}
              maxLength={3}
              pattern="\d{3}"
              required
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
                  (selectedOption as buildingOption)?.value || "";
                const availableOptions =
                  getAvailableZoneTypeOptions(buildingId);

                if (buildingId && availableOptions.length === 0) {
                  toast.warning("Building นี้เลือก Zone Temp ครบแล้ว");
                }

                setFormData((prev) => ({
                  ...prev,
                  building_id: buildingId,
                  zone_type_id:
                    buildingId === prev.building_id ? prev.zone_type_id : "",
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

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>Full Name</label>
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
            <label>
              Zone Temp <span className="required">*</span>
            </label>
            <Select
              className="select"
              classNamePrefix="select"
              options={getAvailableZoneTypeOptions(formData.building_id)}
              onChange={(selectedOption) =>
                setFormData((prev) => ({
                  ...prev,
                  zone_type_id: (selectedOption as zoneTypeOption)?.value || "",
                }))
              }
              value={getAvailableZoneTypeOptions(formData.building_id).find(
                (option) => option.value === formData.zone_type_id,
              )}
              placeholder={
                formData.building_id
                  ? "Select Zone Temp"
                  : "Select Building First"
              }
              isSearchable
              isDisabled={!formData.building_id}
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

export default EditZoneModal;
