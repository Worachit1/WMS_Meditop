import type { outbound, goods_out_item, barcode, box } from "@prisma/client";

export interface BoxFormatter {
  id: string;
  box_code: string | null;
  box_name: string | null;
  quantity?: number | null;
}

export interface BarcodeFormatter {
  barcode: string;
  lot_start: number | null;
  lot_stop: number | null;
  exp_start: number | null;
  exp_stop: number | null;
  barcode_length: number | null;
}

export interface LockLocationFormatter {
  location_name: string;
  qty: number;
}

export interface GoodsOutItemLocationPickFormatter {
  location_id: number;
  location_name: string;
  qty_pick: number;
}

export interface OdooOutboundItemFormatter {
  id: number;
  outbound_id: number;
  outbound_no: string;
  sequence: number | null;
  product_id: number | null;
  code: string | null;
  name: string;
  unit: string;
  tracking: string | null;
  lot_id: number | null;
  lot_serial: string | null;
  qty: number | null;
  sku: string | null;

  // ✅ เดิม (ยังคงไว้)
  lock_no: string | null;
  lock_name: string | null;

  // ✅ ใหม่: location(s) + qty (จาก stock)
  lock_locations?: LockLocationFormatter[]; // optional เพื่อไม่กระทบของเดิม
  lock_no_list?: string[]; // optional string[] สำหรับโชว์แบบเดิม

  location_picks?: GoodsOutItemLocationPickFormatter[];

  pick: number;
  pack: number;
  boxes: BoxFormatter[];
  status: string;
  out_type: string;
  barcode_id: number | null;
  user_pick: string | null;
  user_pack: string | null;
  pick_time?: string | null;
  pack_time?: string | null;
  rtc?: number | null;
  rtc_check: boolean;
  barcode: BarcodeFormatter | null;
  created_at: string;
  updated_at: string | null;

  // ✅ NEW: input_number + barcode_text (คุณใช้ใน controller)
  input_number?: boolean;
  barcode_text?: string | null;
}

export interface OdooOutboundFormatter {
  id: number;
  no: string;
  picking_id: number | null;
  location_id: number | null;
  location: string | null;
  location_dest_id: number | null;
  location_dest: string | null;

  department_id: string | null;

  // ✅ department ใน DB เป็น TEXT เลข เช่น "6"
  // เราจะคงของเดิมไว้ แล้วเพิ่ม field ใหม่
  department: string;

  // ✅ NEW: แสดง department_code ที่ match จาก departments.odoo_id
  department_code?: string | null; // optional ไม่กระทบของเดิม
  department_raw?: string | null; // optional (ถ้าคุณอยากเก็บค่าก่อนทับ)

  reference: string | null;
  origin: string | null;
  date: string;
  out_type: string;
  invoice: string | null;
  in_process: Boolean;
  outbound_barcode: string | null;
  created_at: string;
  updated_at: string | null;
  items: OdooOutboundItemFormatter[];
}

/* ================= Formatter ================= */

export function formatOdooOutbound(
  outbound: outbound & {
    goods_outs?: (goods_out_item & {
      deleted_at?: Date | null;
      barcode_ref?: barcode | null;
      boxes?: any[];
      user_pick?: string | null;
      user_pack?: string | null;
      pick_time?: Date | null;
      pack_time?: Date | null;

      // ✅ extra fields ที่คุณใช้ใน controller (ถ้ามีใน schema)
      barcode_text?: string | null;
      location_picks?: Array<{
        location_id: number;
        qty_pick: number;
        location?: {
          id: number;
          full_name: string;
        } | null;
      }>;
    })[];
    deleted_at?: Date | null;

    // ✅ ถ้าคุณจะ attach department_code มาจาก controller ก็รองรับไว้
    department_code?: string | null;
    department_raw?: string | null;
  },
): OdooOutboundFormatter {
  return {
    id: outbound.id,
    no: outbound.no,
    picking_id: outbound.picking_id ?? null,
    location_id: outbound.location_id ?? null,
    location: outbound.location ?? null,
    location_dest_id: outbound.location_dest_id ?? null,
    location_dest: outbound.location_dest ?? null,

    department_id: outbound.department_id ?? null,

    // ✅ คงของเดิม (เลข text)
    department: outbound.department,

    // ✅ NEW (optional)
    department_code: (outbound as any).department_code ?? null,
    department_raw: (outbound as any).department_raw ?? null,

    reference: outbound.reference ?? null,
    origin: outbound.origin ?? null,
    date: outbound.date.toISOString(),
    out_type: outbound.out_type,
    invoice: outbound.invoice,
    in_process: outbound.in_process,
    outbound_barcode: outbound.outbound_barcode ?? null,
    created_at: outbound.created_at.toISOString(),
    updated_at: outbound.updated_at ? outbound.updated_at.toISOString() : null,

    items: outbound.goods_outs
      ? outbound.goods_outs
          .filter((item) => !item.deleted_at)
          .map((item: any) => ({
            id: item.id,
            outbound_id: item.outbound_id,
            outbound_no: outbound.no,
            sequence: item.sequence ?? null,
            product_id: item.product_id ?? null,
            code: item.code ?? null,
            name: item.name,
            unit: item.unit,
            tracking: item.tracking ?? null,
            lot_id: item.lot_id ?? null,
            lot_serial: item.lot_serial ?? null,
            qty: item.qty ?? null,
            sku: item.sku ?? null,
            rtc: item.rtc ?? null,
            rtc_check: item.rtc_check,


            // ✅ เดิม
            lock_no: item.lock_no ?? null,
            lock_name: item.lock_name ?? null,

            // ✅ NEW (optional) — controller สามารถเติมเพิ่มทีหลังได้
            lock_locations: item.lock_locations ?? undefined,
            lock_no_list: item.lock_no_list ?? undefined,
            location_picks: Array.isArray(item.location_picks)
              ? item.location_picks.map((lp: any) => ({
                  location_id: Number(lp.location_id ?? lp.location?.id ?? 0),
                  location_name: String(lp.location?.full_name ?? ""),
                  qty_pick: Number(lp.qty_pick ?? 0),
                }))
              : [],

            pick: item.pick,
            pack: item.pack,
            boxes:
              item.boxes
                ?.filter((ib: any) => !ib.deleted_at)
                .map((ib: any) => ({
                  id: ib.box.id,
                  box_code: ib.box.box_code,
                  box_name: ib.box.box_name,
                  quantity: ib.quantity ?? null,
                })) ?? [],
            status: item.status,
            out_type: outbound.out_type,
            barcode_id: item.barcode_id ?? null,

            // ✅ NEW: รองรับ field ที่ controller ใช้อยู่
            barcode_text: item.barcode_text ?? null,
            input_number: item.input_number ?? undefined,

            barcode:
              item.barcode_ref && !item.barcode_ref.deleted_at
                ? {
                    barcode: item.barcode_ref.barcode,
                    lot_start: item.barcode_ref.lot_start ?? null,
                    lot_stop: item.barcode_ref.lot_stop ?? null,
                    exp_start: item.barcode_ref.exp_start ?? null,
                    exp_stop: item.barcode_ref.exp_stop ?? null,
                    barcode_length: item.barcode_ref.barcode_length ?? null,
                  }
                : null,

            created_at: item.created_at.toISOString(),
            updated_at: item.updated_at ? item.updated_at.toISOString() : null,
            user_pick: item.user_pick ?? null,
            user_pack: item.user_pack ?? null,
            pick_time: item.pick_time ? item.pick_time.toISOString() : null,
            pack_time: item.pack_time ? item.pack_time.toISOString() : null,
          }))
      : [],
  };
}
