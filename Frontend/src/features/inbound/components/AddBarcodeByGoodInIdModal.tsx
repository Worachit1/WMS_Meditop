import { useState, useEffect } from "react";
import Modal from "../../../components/Modal/Modal";
import { toast } from "react-toastify";
import { successAlert } from "../../../utils/alert";
import type { GoodsInType } from "../types/inbound.type";
import {
  ensureSharedBarcodeForGoodsInGroup,
  findExistingBarcodeInGroup,
  prepareBarcodeForGoodsIn,
} from "../services/barcodeGeneration";
import "./AddBarcodeByGoodInIdModal.css";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  goodsInItem: GoodsInType | null;
  groupItems?: GoodsInType[];
  onSuccess: () => void;
  onCreated?: (item: GoodsInType) => void;
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
  groupItems = [],
  onSuccess,
  onCreated,
}: Props) => {
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [isReusedBarcode, setIsReusedBarcode] = useState(false);

  useEffect(() => {
    const generateBarcodePreview = async () => {
      if (!isOpen || !goodsInItem) return;

      try {
        const existingBarcode = findExistingBarcodeInGroup(
          goodsInItem,
          groupItems,
        );

        if (existingBarcode) {
          setIsReusedBarcode(true);
          setFormData({ barcode: existingBarcode });
          return;
        }

        const prepared = await prepareBarcodeForGoodsIn(String(goodsInItem.id));
        setIsReusedBarcode(false);
        setFormData({ barcode: prepared.barcode });
      } catch (err) {
        console.error("AUTO BARCODE ERROR:", err);
        toast.error(
          err instanceof Error
            ? err.message
            : "Auto generate barcode ไม่สำเร็จ",
        );
      }
    };

    generateBarcodePreview();
  }, [isOpen, goodsInItem, groupItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!goodsInItem) return;

    try {
      setLoading(true);

      const barcode = await ensureSharedBarcodeForGoodsInGroup(
        goodsInItem,
        groupItems.length > 0 ? groupItems : [goodsInItem],
      );

      await successAlert(
        isReusedBarcode ? "ผูก Barcode เดิมสำเร็จ" : "สร้าง Barcode สำเร็จ",
      );

      const createdItem: GoodsInType = {
        ...goodsInItem,
        barcode_text: barcode,
        barcode: { barcode },
      };

      if (onCreated) {
        onCreated(createdItem);
      } else {
        onClose();
      }

      void onSuccess();
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
          <label>
            Barcode {isReusedBarcode ? "(Reuse Existing)" : "(Auto)"}
          </label>
          <input
            name="barcode"
            value={formData.barcode}
            readOnly
            className="addbarcodeByGoodIn-disabled"
          />
        </div>
      </form>
    </Modal>
  );
};

export default AddBarcodeByGoodInIdModal;