// tranfers.type.ts (ตามชื่อที่คุณพิมพ์)

export type TransferPutLocationType = {
  id: number;
  location_id: number;
  location_name: string | null;
  confirmed_put: number;
};

export type TransferItemType = {
  id: string;
  sequence: number | null;
  product_id: number | null;
  code: string | null;
  name: string;
  unit: string | null;
  tracking: string | null;
  lot_id: number | null;
  lot: string | null;
  lot_serial: string | null;
  exp: string | null;
  qty: number | null;
  qty_pick: number | null;
  qty_put: number | null;
  input_number: boolean;
  quantity_receive: number | null;
  quantity_count: number | null;
  quantity_put: number | null;
  barcode_id: number | null;
  lock_no_list?: string[];

  lock_no?: string | null;
  lock_no_dest?: string | null;

  // ✅ NEW
  lock_no_dest_list?: TransferPutLocationType[];

  barcode_text?: string | null;
  barcode_payload?: string | null;

  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TransferDepartmentLite = {
  id: number;
  short_name: string;
};
export type TransferType = {
  id: number;
  picking_id: number | null;
  no: string;

  lot: string | null;
  quantity: number | null;

  location_id: number | null;
  location: string | null;

  location_dest_id: number | null;
  location_dest: string | null;

  department_id: string | null;
  department?: TransferDepartmentLite | null; // compat
  departments?: TransferDepartmentLite[]; // ✅ NEW

  reference: string | null;
  origin: string | null;

  date: string; // ISO
  in_type: string;

  created_at: string; // ISO
  updated_at: string | null;

  items: TransferItemType[];
};

export type TransferBarcodeType = {
  barcode: string;
  lot_start?: number | null;
  lot_stop?: number | null;
  exp_start?: number | null;
  exp_stop?: number | null;
  barcode_length?: number | null;
};

// export type UpdateTransferMovementBody = {
//   id: number;
//   number?: string;
//   status?: string;
//   user_id?: number;
//   user_work_id?: number; // ✅ ผู้รับงาน/คนทำงาน (ตาม ctl: updateData.user connect)
//   department_id?: number;

//   // ✅ ถ้าจะอัปเดตรายการด้วย (ต้องให้ backend รองรับ)
//   items?: Array<{
//     product_id: number;
//     code: string;
//     name: string;
//     lot_serial: string | null;
//     lock_no: string;
//     unit: string;
//     expire_date: string | null;
//     qty: number;
//   }>;
// };

export type TransferMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type TransferListResponse = {
  data: TransferType[];
  meta: TransferMeta;
};
