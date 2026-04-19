import { useState, useEffect } from "react";
import Modal from "../../../components/Modal/Modal";
import { toast } from "react-toastify";
import { successAlert } from "../../../utils/alert";
import { inboundApi, BarcodeCountDepartmentApi } from "../services/inbound.api";
import { goodinApi } from "../../goodin/services/goodin.api";
import type { GoodsInType } from "../types/inbound.type";
import "./AddBarcodeByGoodInIdModal.css";


type Props = {
  isOpen: boolean;
  onClose: () => void;
  goodsInItem: GoodsInType | null;
  onSuccess: () => void;
};

type FormData = {
  barcode: string;
};

const initialForm: FormData = {
  barcode: "",
};

const AddBarcodeByGoodInIdModal = ({
  isOpen,
  onClose,
  goodsInItem,
  onSuccess,
}: Props) => {
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [counterRecord, setCounterRecord] = useState<any>(null);

  // ===============================
  // AUTO GENERATE BARCODE
  // ===============================
  useEffect(() => {
    const generateBarcode = async () => {
      if (!isOpen || !goodsInItem) return;

      try {
        // 1️⃣ get goods in detail
        const goodinRes = await goodinApi.getById(goodsInItem.id);
        const departmentCode = goodinRes.data?.department_code;

        if (!departmentCode) {
          toast.error("ไม่พบ department_code");
          return;
        }

        // 2️⃣ get barcode counter table
        const counterRes = await BarcodeCountDepartmentApi.getAll();
        const raw = counterRes.data;

        // ✅ พยายาม unwrap ให้เป็น array
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.rows)
              ? raw.rows
              : Array.isArray(raw?.result)
                ? raw.result
                : [];
        const record = list.find(
          (x: any) => x.department_code === departmentCode,
        );

        if (!record) {
          toast.error("ไม่พบ department_code ใน barcode_count_departments");
          return;
        }

        setCounterRecord(record);

        const currentCount = Number(record.barcode_count);
        const nextNumber = currentCount + 1;

        const padded = String(nextNumber).padStart(
          String(record.barcode_count).length,
          "0",
        );

        const newBarcode = `${departmentCode}${padded}`;

        setFormData({ barcode: newBarcode });
      } catch (err) {
        console.error("AUTO BARCODE ERROR:", err);
        toast.error("Auto generate barcode ไม่สำเร็จ");
      }
    };

    generateBarcode();
  }, [isOpen, goodsInItem]);

  // ===============================
  // SUBMIT
  // ===============================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.barcode) {
      toast.error("Barcode ว่าง");
      return;
    }

    if (!counterRecord) {
      toast.error("ไม่พบ counter record");
      return;
    }

    try {
      setLoading(true);

      // 1️⃣ create barcode
      await inboundApi.createGoodinBarcode({
        goods_in_id: goodsInItem!.id,
        barcode: formData.barcode,
        lot_start: 0,
        lot_stop: 0,
        exp_start: 0,
        exp_stop: 0,
        barcode_length: formData.barcode.length,
      });

      // 2️⃣ update counter +1
      const newCount = Number(counterRecord.barcode_count) + 1;

      await BarcodeCountDepartmentApi.update(counterRecord.id, {
        barcode_count: String(newCount).padStart(
          String(counterRecord.barcode_count).length,
          "0",
        ),
      });

      await successAlert("สร้าง Barcode สำเร็จ");
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("สร้าง Barcode ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  if (!goodsInItem) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Barcode by Goods In"
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
      <form
        id="add-barcode-form"
        onSubmit={handleSubmit}
        className="form add-barcode-modal"
      >
        <div className="form-group">
          <label>Barcode (Auto)</label>
          <input name="barcode" value={formData.barcode} readOnly  className="addbarcodeByGoodIn-disabled"/>
        </div>
      </form>
    </Modal>
  );
};

export default AddBarcodeByGoodInIdModal;
