import { http } from "../../../services/http";

import type {
  GoodinUpdateData,
  GoodinUpdateLotExp,
} from "../types/goodin.type";

export const goodinApi = {
  getById: (id: string) => http.get(`/goods_ins/get/${encodeURIComponent(id)}`),
  updateQtyCount: (id: string, quantity_count: GoodinUpdateData) =>
    http.patch(`/goods_ins/update/${encodeURIComponent(id)}`, quantity_count),

  updateLotExp: (id: string, data: GoodinUpdateLotExp) =>
    http.patch(`/goods_ins/update/${encodeURIComponent(id)}`, data),
};
