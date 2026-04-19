// outbound.type.ts (เฉพาะส่วน type ที่คุณแปะมา + แก้ให้ใช้กับ confirmToStock ได้ชัวร์)
export interface OutboundType {
  outbound_no: string;
  item: string;
  box: string;
  qty_required: number;
  qty_packed: number;
  out_type: string;
  status?: string;
  user_pick?: string;
  user_pack?: string;
  department_code?: string; 
  created_at: string;
  updated_at: string;
}

export type GoodsOutItemLocationPick = {
  location_id: number;
  location_name: string;
  qty_pick: number;
};

export type GoodsOutBarcodeRef = {
  id?: number;
  barcode?: string;
  lot_start?: number | null;
  lot_stop?: number | null;
  exp_start?: number | null;
  exp_stop?: number | null;
  barcode_length?: number | null;
};

export type GoodsOutItemBox = {
  id?: number;
  box_id?: number;
  quantity?: number;
  box?: {
    id?: number;
    box_name?: string;
    box_code?: string;
  };
};

export type GoodsOutLockLocation = {
  location_name?: string;
  qty?: number;
};

export type GoodsOutItem = {
  id?: number | string;
  outbound_id?: number | string;
  outbound_no?: string; // ✅ เพิ่ม
  product_id?: number | string;

  code?: string;
  name: string;
  unit?: string;

  tracking?: string | null;
  qty?: number;
  pick?: number;
  pack?: number;
  confirmed_pick?: number;

  lot_id?: number | null;
  lot_serial?: string | null;
  lot_name?: string | null;

  sku?: string | null;

  lock_no?: string | string[] | null;
  lock_name?: string | null;

  lot_adjustment_id?: number | null;

  barcode_text?: string | null;
  input_number?: boolean;
  exp?: string | null;

  status?: string;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;

  user_pick?: string | null;
  user_pack?: string | null;
  pick_time?: string | null;
  pack_time?: string | null;

  qty_required?: number;
  qty_pick?: number;
  remaining?: number;
  completed?: boolean;

  total_location_pick?: number;

  out_type?: string | null; // ✅ เพิ่ม
  invoice?: string | null;  // ✅ เพิ่ม
  origin?: string | null;   // ✅ เพิ่ม
  box_id?: number | string | null; // ✅ เพิ่ม

  location_picks?: GoodsOutItemLocationPick[];
  lock_locations?: GoodsOutLockLocation[];

  barcode?: GoodsOutBarcodeRef | null;
  barcode_ref?: GoodsOutBarcodeRef | null;

  boxes?: GoodsOutItemBox[];
};

export type OutboundDetail = {
  no: string;
  invoice?: string | null;
  origin?: string | null;
  outbound_barcode?: string | null;
  out_type?: string | null;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  items: GoodsOutItem[];
};

export type InvoiceData = {
  no: string;
  invoice: string;
  origin: string;
  outbound_barcode?: string | null;
  out_type?: string | null;
  items: GoodsOutItem[];
  batch_name?: string | null;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type BatchItem = {
  invoice_item_id?: number;
  outbound_no?: string;
  goods_out_id?: string;
  line_ids?: string[];

  product_id?: number;
  code?: string;
  name: string;

  lock_no?: string | string[] | null;
  lock_name?: string | null;

  lot_serial?: string | null;
  lot_no?: string | null;
  lot_name?: string | null;

  quantity?: number;
  pick?: number;
  pack?: number;

  batchId?: string;

  barcode?: string | null;
  barcode_text?: string | null;
  sku?: string | null;
  input_number?: boolean;
  exp?: string | null;

  location_picks?: GoodsOutItemLocationPick[];
  lock_locations?: GoodsOutLockLocation[];
};

export type DocInvoiceItem = {
  id?: number | string;
  code?: string;
  name?: string;
  qty?: number;
  unit?: string;
  lot_serial?: string | null;
};



export interface GoodsOutBox {
  id: number;
  goods_out_item_id: number;
  box_id: number;
}


export interface InvoiceList {
  no: string;
  invoice_barcode: string;
  items: GoodsOutItem[];
  created_at: string;
}


export interface DocInvoice {
  id: string;
  doc_barcode: string;
  doc_invoice: string;
  out_type: string;
  invoices?: InvoiceData[];
  // name: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

// ✅ เพิ่ม type ใหม่สำหรับ packed items
export interface PackedItem {
  no: number;
  date: string;
  code: string;
  box: string;
  boxes?: {
    id: number;
    box_code: string;
    box_name: string;
    quantity: number;
  }[];
  qty_required: number;
  qty_packed: number;
  pack: number;
  pick: number;
  out_type: string;
  outbound_no: string;
  invoice?: string;
  origin?: string;
  item_id: number;
  status: string;
  user_pick?: string;
  user_pack?: string;
}

export interface PackedItemsResponse {
  data: PackedItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


export type OutboundView = "doc" | "picking" | "packing";


export type PackProductMatch = {
  outbound_id: number;
  no: string;
  origin: string | null;
  invoice: string | null;
  matched_by: string[];
};

export type PackProductHeader = {
  id: number;
  name: string;
  scan_prefix: string;
  max_box: number;
  status: string;
  created_at?: string;
  updated_at?: string | null;
};

export type PackProductScannedParsed = {
  // name: string;
  raw: string;
  prefix: string;
  doc_keys: string[];
  box_no: number;
  box_max: number;
  box_label: string;
  box_code: string;
};

export type PackProductBoxItem = {
  id: number;
  goods_out_item_id: number;
  quantity: number;
  goods_out_item?: {
    id: number;
    outbound_id?: number | string;
    code?: string | null;
    name?: string | null;
    lot_serial?: string | null;
    qty?: number | null;
    pack?: number | null;
    status?: string | null;
  } | null;
};

export type PackProductBox = {
  id: number;
  box_no: number;
  box_max: number;
  box_label: string;
  box_code: string;
  status: string;
  created_at?: string;
  updated_at?: string | null;
  items?: PackProductBoxItem[];
};

export type PackProductOutbound = {
  id: number;
  no: string;
  origin?: string | null;
  invoice?: string | null;
  out_type?: string | null;
  department?: string | null;
  department_id?: string | null;
  location?: string | null;
  location_dest?: string | null;
  items: GoodsOutItem[];
};

export type ScanPackProductResponse = {
  message: string;
  data: {
    parsed: PackProductScannedParsed;
    matches: PackProductMatch[];
    box_action: "created" | "opened" | "closed" | "reopened";
    pack_product: PackProductHeader;
    current_box: PackProductBox | null;
    boxes: PackProductBox[];
    outbounds: PackProductOutbound[];
    grouped_items?: GroupedPackProductItem[];
  };
};

export type ScanPackProductItemResponse = {
  message: string;
  data: {
    pack_product_id: number;
    box: PackProductBox;
    scan_result?: {
      raw_input?: string;
      normalized_input?: string;
      barcode_text?: string | null;
      lot_serial?: string | null;
      exp_text?: string | null;
      exp?: string | null;
      matched_by?: string | null;
    };
    matched_item: {
      id: number;
      outbound_id?: number | string;
      outbound_no?: string | null;
      sequence?: number | null;
      product_id?: number | string | null;
      code?: string | null;
      name?: string | null;
      unit?: string | null;
      lot_id?: number | null;
      lot_serial?: string | null;
      qty?: number | null;
      pick?: number | null;
      pack_before?: number | null;
      pack_after?: number | null;
      status_after?: string | null;
    };
    box_item?: {
      id: number;
      pack_product_box_id: number;
      goods_out_item_id: number;
      quantity: number;
      updated_at?: string;
    } | null;
    synced_item?: {
      id: number;
      qty?: number | null;
      pack?: number | null;
      status?: string | null;
      updated_at?: string;
    } | null;
    box_items: PackProductBoxItem[];
    removed_qty?: number;
  };
};

export type GetPackProductResponse = {
  data: {
    id: number;
    name: string;
    scan_prefix: string;
    max_box: number;
    status: string;
    created_at?: string;
    updated_at?: string | null;
    outbounds?: Array<{
      outbound: PackProductOutbound;
    }>;
    boxes?: PackProductBox[];
    grouped_items?: GroupedPackProductItem[];
  };
};

export interface PackProductListRow {
  id: number;
  name: string;
  batch_name: string;
  scan_prefix: string;
  max_box: number;
  status: string;
  remark?: string | null;
  created_at: string;
  updated_at?: string | null;
  summary?: {
    total_outbounds: number;
    total_items: number;
    completed_items: number;
    incomplete_items: number;
    total_qty: number;
    total_pack: number;
    progress_percent: number;
    total_boxes: number;
    distinct_box_count: number;
    max_box: number;
    open_box_count: number;
    closed_box_count: number;
    missing_box_nos: number[];
    can_finalize: boolean;
  };
  outbounds?: Array<{
    id: number;
    no: string;
    origin?: string | null;
    invoice?: string | null;
    out_type?: string | null;
  }>;
}

export interface PackProductListResponse {
  data: PackProductListRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type GroupedPackProductItem = {
  code: string | null;
  name: string;
  lot_serial: string | null;
  qty: number;
  pick: number;
  pack: number;
  status: string;
  outbound_ids: number[];
  outbound_nos: string[];
  grouped_item_ids: number[];
  box_ids: number[];
  box_nos: number[];
  box_labels: string[];
  box_codes: string[];
  box_display?: string | null;
  sample_item?: any | null;
};