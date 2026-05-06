import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { zoneApi } from "../services/zone.api";
import { confirmAlert, successAlert } from "../../../utils/alert";

import type { BuildingType } from "../../building/types/building.type";
import type { ZoneType_Type } from "../../zone_type/types/zone_type.type";
import { zoneTypeApi } from "../../zone_type/services/zone_type.api";
import { buildingApi } from "../../building/services/building.api";
import Select from "react-select";

type AddZoneModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type buildingOption = {
  value: string;
  label: string;
};
type zoneTypeOption = {
  value: string;
  label: string;
};

const AddZoneModal = ({ isOpen, onClose, onSuccess }: AddZoneModalProps) => {
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

  const [_allZoneTypes, setAllZoneTypes] = useState<ZoneType_Type[]>([]);

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

  const getAvailableZoneTypeOptions = (buildingId: string) => {
    if (!buildingId) return [];

    const usedZoneTypeIds = new Set(
      allZones
        .filter((zone: any) => getZoneBuildingId(zone) === String(buildingId))
        .map((zone: any) => getZoneTypeId(zone))
        .filter(Boolean),
    );

    console.log("buildingId:", buildingId);
    console.log("allZones:", allZones);
    console.log("usedZoneTypeIds:", Array.from(usedZoneTypeIds));

    return zoneTypeOptions.filter(
      (option) => !usedZoneTypeIds.has(String(option.value)),
    );
  };

  // Fetch buildings, zone types and auto-generate zone_code
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

        const mappedZoneTypes = zoneTypes.map((type) => ({
          value: String(type.id),
          label: String(type.short_name ?? type.id),
        }));

        setZoneTypeOptions(mappedZoneTypes);

        // Auto-generate zone_code
        const zonesResponse = await zoneApi.getAll();
        const zones = pickArray(zonesResponse.data);
        setAllZones(zones);

        let newCode = "001";
        if (zones && zones.length > 0) {
          // หา zone_code ที่ใหญ่ที่สุด
          const maxCode = zones.reduce((max, zone) => {
            const code = parseInt(zone.zone_code || "0");
            return code > max ? code : max;
          }, 0);
          const nextCode = maxCode + 1;
          newCode = nextCode.toString().padStart(3, "0");
        }

        setFormData((prev) => ({ ...prev, zone_code: newCode }));
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to load data");
      }
    };

    fetchData();
  }, [isOpen]);

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

    const result = await confirmAlert("");
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

      await zoneApi.create(submitData);
      setFormData({
        zone_code: "",
        full_name: "",
        short_name: "",
        building_id: "",
        zone_type_id: "",
        remark: "",
      });
      await successAlert("Success!", "Zone created successfully");
      onSuccess();
      onClose(); // ✅ ปิด modal หลัง success
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
      title="เพิ่มข้อมูล Zone"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-zone-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="add-zone-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full disabled">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="zone_code"
              placeholder="Auto Generated"
              value={formData.zone_code}
              onChange={handleChange}
              maxLength={3}
              pattern="\d{3}"
              required
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
                  (selectedOption as buildingOption)?.value || "";

                const availableOptions =
                  getAvailableZoneTypeOptions(buildingId);

                if (buildingId && availableOptions.length === 0) {
                  toast.warning("Building นี้เลือก Zone Temp ครบแล้ว");
                }

                setFormData((prev) => ({
                  ...prev,
                  building_id: buildingId,
                  zone_type_id: "",
                }));
              }}
              value={buildingOptions.find(
                (option) => option.value === formData.building_id,
              )}
              placeholder="Select Building"
              isSearchable
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

export default AddZoneModal;
