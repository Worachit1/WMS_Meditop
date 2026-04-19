export interface DepartmentType {
  id : number;
  department_code: string;
  full_name: string;
  short_name: string;
  remark: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
};

export interface DepartmentFormData {
  department_code: string;
  full_name: string;
  short_name: string;
  remark: string;
};

export interface DepartmentFilter {
  department_code: string | null;
  full_name: string | null;
  short_name: string | null;
};

export interface DepartmentMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export interface ApiDepartmentResponse {
  data: DepartmentType[];
  meta: DepartmentMeta;
};
