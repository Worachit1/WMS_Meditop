export interface ZoneType_Type {
  id: number; 
  zone_type_code: string;
  full_name: string;
  short_name: string;
  remark: string;
};

export interface ZoneTypeFormData {
  zone_type_code: string;
  full_name: string;
  short_name: string;
  remark: string;
};

export interface ZoneTypeFilter {
  zone_type_code: string | null;
  full_name: string | null;
  short_name: string | null;
};

export interface ZoneTypeMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export interface ApiZoneTypeResponse {
  data: ZoneType_Type[];
  meta: ZoneTypeMeta;
};
