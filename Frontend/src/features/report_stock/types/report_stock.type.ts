export interface ReportStockType {
  id: number;
  snapshot_date: string;
  product_code: string;
  product_name: string;
  unit: string;
  location_name: string;
  location?: {
    building?: { short_name: string };
    zone?: { short_name: string; zone_type: { short_name: string } };
  };

  lot_name: string;
  expiration_date: string;
  quantity: number;
}

export interface ReportStockMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiReportStockResponse {
  data: ReportStockType[];
  meta: ReportStockMeta;
}
