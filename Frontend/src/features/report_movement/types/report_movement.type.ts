export interface ReportMovementType {
  id: number;
  no: string;
  created_at: string;
  type: string;
  source: string;
  location: string;
  location_dest: string;
  user_ref: string;
}

export interface DetailMovementItemType {
  id: number | string;
  code: string | null;
  name: string;
  qty: number;
  unit: string | null;
  lot_serial?: string | null;
  exp?: string | null;
  zone_type?: string | null;
  updated_at?: string | null;
}

export interface DetailReportMovementType {
  id: number;
  no: string;
  created_at: string;
  out_type: string;
  location?: string;
  location_dest?: string;
  user_ref?: string;
  department?: string;
  origin?: string;
  reference?: string;
  items?: DetailMovementItemType[];
}

export interface ReportMovementMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiReportMovementResponse {
  data: ReportMovementType[];
  meta: ReportMovementMeta;
}
