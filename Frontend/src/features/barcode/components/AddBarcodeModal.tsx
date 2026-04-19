import { useState } from "react";
import AsyncSelect from "react-select/async";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { barcodeApi } from "../services/barcode.api";
import { confirmAlert, successAlert } from "../../../utils/alert";
import { goodApi } from "../../good/services/good.api";
import type { GoodType } from "../../good/types/good.type";

type GoodsOption = {
  label: string;
  value: number; // product_id
  product_id: number;
  product_code: string;
  product_name: string;
};

type AddBarcodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const AddBarcodeModal = ({
  isOpen,
  onClose,
  onSuccess,
}: AddBarcodeModalProps) => {
  const [formData, setFormData] = useState({
    barcode_id: "",
    barcode: "",
    goods_id: null as number | null, // store selected goods id
    lot_start: "",
    lot_stop: "",
    exp_start: "",
    exp_stop: "",
    barcode_length: "",
  });

  const [selectedGoods, setSelectedGoods] = useState<GoodsOption | null>(null);

  // Fetch goods for select

  const loadGoodsOptions = async (
    inputValue: string,
  ): Promise<GoodsOption[]> => {
    if (!inputValue || inputValue.length < 2) return [];

    try {
      const res = await goodApi.getAll({
        search: inputValue,
        page: 1,
        limit: 50,
      });

      const goods: GoodType[] = res.data?.data || [];

      return goods.map((g) => ({
        label: `${g.product_code} - ${g.product_name} (Lot: ${g.lot_id})`,
        value: g.product_id, // react-select ใช้
        product_id: g.product_id, // payload จริง
        product_code: g.product_code,
        product_name: g.product_name,
      }));
    } catch {
      return [];
    }
  };

  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;

    if (
      name === "barcode_id" ||
      name === "barcode" ||
      name === "barcode_length" ||
      name === "lot_start" ||
      name === "lot_stop" ||
      name === "exp_start" ||
      name === "exp_stop"
    ) {
      const numericValue = value.replace(/\D/g, ""); // Remove non-digits
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGoodsSelect = (option: GoodsOption | null) => {
    setSelectedGoods(option);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedGoods) {
      toast.error("กรุณาเลือก SKU");
      return;
    }

    const result = await confirmAlert("");
    if (!result.isConfirmed) {
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        barcode_id: Number(formData.barcode_id),
        barcode: formData.barcode,

        // ✅ payload จาก AsyncSelect (เลือกครั้งเดียว ได้ครบ)
        product_id: selectedGoods.product_id,
        product_code: selectedGoods.product_code,
        product_name: selectedGoods.product_name,

        lot_start: Number(formData.lot_start),
        lot_stop: Number(formData.lot_stop),
        exp_start: Number(formData.exp_start),
        exp_stop: Number(formData.exp_stop),
        barcode_length: Number(formData.barcode_length),
      };

      await barcodeApi.create(submitData);

      setFormData({
        barcode_id: "",
        barcode: "",
        goods_id: null,
        lot_start: "",
        lot_stop: "",
        exp_start: "",
        exp_stop: "",
        barcode_length: "",
      });

      setSelectedGoods(null);

      await successAlert("Success!", "Barcode created successfully");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error creating barcode:", error);

      if (
        error?.message?.includes("Id นี้ถูกใช้แล้ว") ||
        error?.response?.status === 409
      ) {
        toast.error("Id นี้ถูกใช้แล้ว");
      } else {
        toast.error("Failed to create barcode");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="เพิ่มข้อมูล Barcode"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-barcode-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="add-barcode-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ID <span className="required">*</span>
            </label>
            <input
              type="text"
              name="barcode_id"
              placeholder="odoo ID"
              value={formData.barcode_id}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>Barcode</label>
            <input
              type="text"
              name="barcode"
              placeholder="Barcode"
              value={formData.barcode}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>SKU</label>
            <AsyncSelect<GoodsOption>
              cacheOptions
              loadOptions={loadGoodsOptions}
              onChange={handleGoodsSelect}
              isClearable
              placeholder="พิมพ์ SKU เพื่อค้นหา"
              classNamePrefix="react-select"
              styles={{ container: (base) => ({ ...base, width: "100%" }) }}
            />
          </div>
        </div>

        <div className="form-row form-row-2col">
          <div className="form-group">
            <label>Lot. Start</label>
            <input
              type="text"
              name="lot_start"
              value={formData.lot_start}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Lot. End</label>
            <input
              type="text"
              name="lot_stop"
              value={formData.lot_stop}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row form-row-2col">
          <div className="form-group">
            <label>Exp. Start</label>
            <input
              type="text"
              name="exp_start"
              value={formData.exp_start}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Exp. End</label>
            <input
              type="text"
              name="exp_stop"
              value={formData.exp_stop}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>Barcode Length</label>
            <input
              type="text"
              name="barcode_length"
              placeholder="Barcode Length"
              value={formData.barcode_length}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default AddBarcodeModal;
