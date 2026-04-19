export interface LocationType {
  id: number;
  location_code: string;
  full_name: string;
  building_id: number;
  zone_id: number;
  building?: any;
  zone?: any;
  zone_type?: string;
  lock_no: string;
  location_img: string;
  status: string;
  ncr_check: boolean;
  ignore : boolean;
  remark: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface LocationFormData {
  location_code: string;
  building_id: number;
  zone_id: number;
  lock_no?: string;
  location_img: string | File;
  ncr_check: boolean;
  remark: string;
  status: string;
  ignore: boolean;
}

export interface LocationUpdateData {
  full_name: string;
  building_id: number;
  zone_id: number;
  lock_no?: string;
  location_img: string | File;
  status: string;
  ncr_check: boolean;
  ignore: boolean;
  remark: string;
}

export interface LocationFilter {
  location_code: string | null;
  full_name: string | null;
  building_id: string | null;
  zone_id: string | null;
  lock_no: string | null;
  status: string | null;
  ncr_check: boolean | null;
  ignore: boolean | null;

}

export interface LocationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiLocationResponse {
  data: LocationType[];
  meta: LocationMeta;
}
