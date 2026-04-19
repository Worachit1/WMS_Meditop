
export interface ZoneType {
  id: number;
  zone_code: string;
  full_name: string;
  short_name: string;
  building_id: string;
  zone_type_id: string;
  building?: any;
  zone_type?: any;
  remark: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ZoneFormData {
  zone_code: string;
  full_name: string;
  short_name: string;
  building_id: number;
  zone_type_id: number;
  remark: string;
};

export interface ZoneFilter {
  zone_code: string | null;
  full_name: string | null;
  short_name: string | null;
  building_id: string | null;
  zone_type_id: string | null;
};

export interface ZoneMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export interface ApiZoneResponse {
  data: ZoneType[];
  meta: ZoneMeta;
};

