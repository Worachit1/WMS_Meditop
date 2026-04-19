import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import Modal from "../../../components/Modal/Modal";
import { barcodeApi } from "../services/barcode.api";
import AsyncSelect from "react-select/async";
import { warningAlert, successAlert } from "../../../utils/alert";
import { goodApi } from "../../good/services/good.api";

/* =======================
   Types
======================= */

type GoodsOption = {
  label: string;
  value: number; // product_id
  product_id: number;
  product_code: string;
  product_name: string;
};

type EditBarcodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  barcodeId: number;
};

const EditBarcodeModal = ({
  isOpen,
  onClose,
  onSuccess,
  barcodeId,
}: EditBarcodeModalProps) => {
  /* ---------- Form State ---------- */
  const [formData, setFormData] = useState({
    barcode_id: "",
    barcode: "",
    product_id: 0,
    product_code: "",
    product_name: "",
    lot_start: "",
    lot_stop: "",
    exp_start: "",
    exp_stop: "",
    barcode_length: "",
  });

  const [loading, setLoading] = useState(false);
  const [selectedGoods, setSelectedGoods] = useState<GoodsOption | null>(null);

  /* ---------- Load Goods ---------- */
  const loadGoodsOptions = async (
    inputValue: string,
  ): Promise<GoodsOption[]> => {
    if (!inputValue || inputValue.length < 2) return [];

    try {
      const res = await goodApi.getAll({
        search: inputValue,
        page: 1,
        limit: 20,
      });

      const goods = res.data?.data || [];

      return goods.map((g: any) => ({
        label: `${g.product_code} - ${g.product_name}`,
        value: g.product_id,
        product_id: g.product_id,
        product_code: g.product_code,
        product_name: g.product_name,
      }));
    } catch {
      return [];
    }
  };

  const fetchBarcodeDetails = async (id: number) => {
    try {
      const response = await barcodeApi.getById(id);

      // 🔥 normalize response
      let barcode: any = response.data;

      if (barcode?.data) {
        barcode = barcode.data;
      }

      if (Array.isArray(barcode)) {
        barcode = barcode[0];
      }

      if (!barcode || !barcode.id) {
        toast.error("Barcode not found");
        return;
      }


      setFormData({
        barcode_id: barcode.barcode_id?.toString() ?? "",
        barcode: barcode.barcode ?? "",
        product_id: barcode.product_id ?? 0,
        product_code: barcode.product_code ?? "",
        product_name: barcode.product_name ?? "",
        lot_start: barcode.lot_start != null ? String(barcode.lot_start) : "",
        lot_stop: barcode.lot_stop != null ? String(barcode.lot_stop) : "",
        exp_start: barcode.exp_start != null ? String(barcode.exp_start) : "",
        exp_stop: barcode.exp_stop != null ? String(barcode.exp_stop) : "",
        barcode_length:
          barcode.barcode_length != null ? String(barcode.barcode_length) : "",
      });

      if (barcode.product_id && barcode.product_code) {
        setSelectedGoods({
          label: `${barcode.product_code} - ${barcode.product_name ?? ""}`,
          value: barcode.product_id,
          product_id: barcode.product_id,
          product_code: barcode.product_code,
          product_name: barcode.product_name ?? "",
        });
      } else {
        setSelectedGoods(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch barcode details");
    }
  };

  /* ---------- Effects ---------- */
  useEffect(() => {
    if (isOpen && barcodeId) {
      fetchBarcodeDetails(barcodeId);
    }
  }, [isOpen, barcodeId]);

  /* ---------- Handlers ---------- */
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGoodsChange = (option: GoodsOption | null) => {
    setSelectedGoods(option);

    if (!option) {
      setFormData((prev) => ({
        ...prev,
        product_id: 0,
        product_code: "",
        product_name: "",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      product_id: option.product_id,
      product_code: option.product_code,
      product_name: option.product_name,
    }));
  };

  /* ---------- Submit ---------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await warningAlert("");
    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const submitData = {
        barcode_id: Number(formData.barcode_id), // always a number
        barcode: formData.barcode,
        product_id: formData.product_id || 0,
        product_code: formData.product_code || "",
        product_name: formData.product_name || "",
        lot_start: Number(formData.lot_start) || 0,
        lot_stop: Number(formData.lot_stop) || 0,
        exp_start: Number(formData.exp_start) || 0,
        exp_stop: Number(formData.exp_stop) || 0,
        barcode_length: Number(formData.barcode_length) || 0,
      };

      await barcodeApi.update(barcodeId, submitData);
      await successAlert("Success!", "Barcode updated successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update barcode");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="แก้ไขข้อมูล Barcode"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="edit-barcode-form"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-barcode-form" onSubmit={handleSubmit}>
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
            <label>
              SKU <span className="required">*</span>
            </label>
            <AsyncSelect<GoodsOption>
              cacheOptions
              loadOptions={loadGoodsOptions}
              value={selectedGoods}
              onChange={handleGoodsChange}
              isClearable
              placeholder="พิมพ์ SKU เพื่อค้นหา"
              classNamePrefix="react-select"
              styles={{ container: (base) => ({ ...base, width: '100%' }) }}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-full">
            <label>
              ISO Code <span className="required">*</span>
            </label>
            <input type="text" name="iso_code" />
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

export default EditBarcodeModal;
