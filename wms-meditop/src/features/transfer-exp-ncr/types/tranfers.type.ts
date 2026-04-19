export type TransferBarcodeType = {
  barcode: string;
  lot_start?: number | null;
  lot_stop?: number | null;
  exp_start?: number | null;
  exp_stop?: number | null;
  barcode_length?: number | null;
};

export type TransferPickLocationType = {
  location_id: number;
  location_name: string;
  confirmed_qty: number;
};

export type TransferPutLocationType = {
  location_id: number;
  location_name: string;
  confirmed_put: number;
};

export type TransferLockLocationType = {
  location_name: string;
  qty: number;
  ncr_check?: boolean;
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
  quantity_receive: number | null;
  quantity_count: number | null;
  quantity_put: number | null;
  barcode_id: number | null;

  barcode?: TransferBarcodeType | null;
  barcode_text?: string | null;

  input_number?: boolean;
  zone_type?: string | null;
  user_ref?: string | null;

  lock_no_list?: string[];
  lock_locations?: TransferLockLocationType[];

  ncr_location?: string | null;
  ncr_locations?: string[];

  pick_locations?: TransferPickLocationType[];
  put_locations?: TransferPutLocationType[];
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
  department: string | null;

  reference: string | null;
  origin: string | null;

  date: string;
  in_type: string;

  created_at: string;
  updated_at: string | null;

  items: TransferItemType[];
};

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