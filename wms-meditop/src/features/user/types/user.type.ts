export interface UserType {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  tel: string;
  username: string;
  user_level: string;
  department: {
    id: number;
    full_name: string;
    short_name: string;
  }[];
  user_img: string;
  status: string;
  remark: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
};

export interface UserFormData {
  first_name: string;
  last_name: string;
  email: string;
  tel: string;
  username: string;
  password: string;
  user_level: string;
  department_ids: number[];
  user_img: string | File;
  status: string;
  remark: string;
}

export interface UserUpdateData {
  first_name: string;
  last_name: string;
  email: string;
  tel: string;
  username: string;
  user_level: string;
  department_ids: number[];
  user_img: string | File;
  status: string;
  remark: string;
  password?: string;
};

export interface UserFilter {
  id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  username: string | null;
  user_level: string | null;
  status: string | null;
};

export interface UserMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export interface ApiUserResponse {
  data: UserType[];
  meta: UserMeta;
};
