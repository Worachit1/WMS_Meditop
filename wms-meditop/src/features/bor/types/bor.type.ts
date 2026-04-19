export interface BorType {
  no: string;
  invoice?: string | null;
  origin?: string | null;
  location_name?: string | null;
  location_dest_name?: string | null; 
  department?: string | null;
  status: string;
  created_at: string;
}

export interface BorMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiBorResponse {
  data: BorType[];
  meta: BorMeta;
}