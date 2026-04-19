export interface BuildingType {
  id: number;
  building_code: string;
  full_name: string;
  short_name: string;
  remark: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface BuildingFormData {
  building_code: string;
  full_name: string;
  short_name: string;
  remark: string;
};

export interface BuildingFilter {
  id: string | null;
  full_name: string | null;
  short_name: string | null;
};

export interface BuildingMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export interface ApiBuildingResponse {
  data: BuildingType[];
  meta: BuildingMeta;
};
