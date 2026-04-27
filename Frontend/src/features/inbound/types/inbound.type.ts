export interface GoodsInType {
  id: string;
  inbound_id?: number;
  code: string | null;
  name: string;
  quantity_receive?: number;
  quantity_count?: number;
  unit: string;
  zone_type?: string | null;
  lot?: string | null;
  exp?: string | null;
  no_expiry?: boolean;
  qr_payload?: string | null;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  lot_id: number | null;
  lot_serial: string | null;
  product_id: number | null;
  qty: number;
  sequence: number | null;
  tracking: string | null;
  // ✅ NEW: ใช้ซ่อน/โชว์ปุ่ม Edit
  input_number?: boolean;
  barcode_text?: string; // ✅ เพิ่ม
  barcode?: {
    barcode: string;
    lot_start?: number;
    lot_stop?: number;
    exp_start?: number;
    exp_stop?: number;
    barcode_length?: number;
  } | null;
}

export interface InboundType {
  id?: number;
  no: string;
  lot: string | null;
  date: string;
  quantity: number;
  in_type: string;
  department: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  department_id: string;
  location: string;
  location_dest: string;
  location_dest_id: number;
  location_id: number;
  origin: string;
  picking_id: number;
  reference: string;
  goods_ins?: GoodsInType[];
  items?: GoodsInType[];

  // ✅ FE-only: location ที่ scan แล้ว (ไม่จำเป็นต้องมีใน backend model)
  scanned_location_full_name?: string;
  scanned_location_id?: number;
}

export interface InboundFilter {
  sku: string | null;
  lot: string | null;
  date: string | null;
  quantity: number | null;
  in_type: string | null;
  department: string | null;
}

export interface InboundMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  statusCounts: {
    pending: number;
    completed: number;
  };
}

export interface ApiInboundResponse {
  data: InboundType[];
  meta: InboundMeta;
}

export interface ApiInboundByIdResponse {
  data: InboundType;
}

export interface ApiInboundByIdPaginatedResponse {
  inbound: InboundType;
  data: GoodsInType[];
  meta: InboundMeta;
}
