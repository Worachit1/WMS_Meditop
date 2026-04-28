export type BorrowStockStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | string;

export type BorrowStockDepartmentType = {
  id: number;
  short_name: string | null;
  full_name: string | null;
};

export type BorrowStockItemType = {
  id: number;
  code: string;
  name: string | null;
  lot_serial: string;
  expiration_date: string | null;
  system_qty: number;
  executed_qty: number | null;
  created_at?: string;
  updated_at?: string | null;

  barcode_text?: string | null;
  barcode?: string | null;

  is_outside_location?: boolean;
  row_style?: "warning-yellow" | "normal" | string;
  allow_manual_executed_qty?: boolean;
  outside_source_location_name?: string | null;
  outside_source_qty?: number | null;
};

export type BorrowStockType = {
  id: number;
  location_name: string;
  status: BorrowStockStatus;
  user_ref: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string | null;
  all_departments?: boolean;

  department_id?: number | null;
  departments: BorrowStockDepartmentType[];
  items: BorrowStockItemType[];
};

export type StartBorrowStockBody = {
  location_full_name: string;
  department_ids?: number[];
  all_departments?: boolean;
  remark?: string | null;
  items: Array<{
    code: string;
    name?: string | null;
    lot_serial: string;
    expiration_date?: string | null;
    system_qty: number;
    executed_qty?: number | null;
    is_outside_location?: boolean;
  }>;
};

export type StartBorrowStockResponse = {
  location: {
    location_id: number;
    location_name: string;
  };
  all_departments?: boolean;
  department_ids?: number[];
  doc: BorrowStockType;
};

export type ScanBorrowStockBarcodeBody = {
  barcode: string;
  location_full_name: string;
};

export type ScanBorrowStockBarcodeResponse = {
  location: {
    location_id: number;
    location_name: string;
  };
  scanned: {
    barcode: string;
    normalized_input?: string;
    barcode_text?: string | null;
    lot_serial?: string | null;
    exp?: string | null;
    matched_by?: string | null;
  };
  matched_stock: {
    product_id: number | null;
    code: string;
    name: string | null;
    lot_serial: string;
    expiration_date: string | null;
    system_qty: number;
    executed_qty?: number;
    unit: string | null;
  };
  action?:
    | "created_new_item"
    | "incremented_existing_item"
    | "matched_existing_item"
    | string;
  affected_item_id?: number | null;
  created_item_id?: number | null;
  doc: BorrowStockType;
};

export type UpdateBorrowStockItemBody = {
  executed_qty: number;
};

export type ConfirmBorrowStockResponse = {
  doc: BorrowStockType;
};

export type ScanBarcodePreviewResponse = {
  location: {
    location_id: number | null;
    location_name: string;
    lock_no?: string | null;
  };
  scanned: {
    payload?: string;
    barcode?: string;
    normalized_input?: string;
    barcode_text: string | null;
    lot_serial: string | null;
    exp: string | null;
    matched_by?: string | null;
  };
  goods_in: {
    id: number;
    code: string;
    name: string | null;
    unit: string | null;
    lot_id?: number | null;
    lot_serial: string;
    exp: string | null;
    product_id: number | null;
    barcode_text: string | null;
  };
  item: {
    code: string;
    name: string | null;
    lot_id?: number | null;
    lot_serial: string;
    expiration_date: string | null;
    system_qty: number;
    executed_qty: number;
    unit: string | null;
  };
  is_outside_location?: boolean;
  row_style?: "warning-yellow" | "normal" | string;
  stock_source?: {
    table: string;
    source?: string | null;
    location_id: number | null;
    location_name: string | null;
    expiration_date: string | null;
    qty?: number;
  } | null;
  suggested_stock_source?: {
    table: string;
    source?: string | null;
    location_id: number | null;
    location_name: string | null;
    expiration_date: string | null;
    qty?: number;
  } | null;
  message?: string | null;
};

export type ScanBorpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63 = {
  barcode: string;
  location_full_name: string;
  allow_outside_location?: boolean;
  department_ids?: number[];
  all_departments?: boolean;
};

export type AddScannedBorrowStockItemBody = {
  code: string;
  name?: string | null;
  lot_serial: string;
  expiration_date?: string | null;
  system_qty: number;
  executed_qty?: number | null;

  is_outside_location?: boolean;
  barcode_text?: string | null;
  barcode?: string | null;

  outside_source_location_name?: string | null;
  outside_source_qty?: number | null;
};

export type AddScannedBorrowStockItemResponse = {
  doc: BorrowStockType;
  item?: BorrowStockItemType;
};

export interface BorrowStockMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
   statusCounts?: {
      pending: number;
      completed: number;
    };
}

export interface ApiBorrowStockResponse {
  data: BorrowStockType[];
  meta: BorrowStockMeta;
}