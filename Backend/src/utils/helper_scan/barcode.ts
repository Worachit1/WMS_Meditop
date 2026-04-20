import { prisma } from "../../lib/prisma";
import { badRequest } from "../appError";

export const EXP_NULL_PLACEHOLDER = "999999";
export const LOT_NULL_PLACEHOLDER = "XXXXXX";

export type ResolvedScanResult = {
  raw_input: string;
  normalized_input: string;
  matched_by: "GS1_AI" | "FIXED_META" | "BASE_SUFFIX" | "MASTER_PREFIX";
  barcode_text: string | null;
  lot_serial: string | null;
  exp_text: string | null;
  exp: Date | null;
  master_barcode_id?: number | null;
};

export function normalizeScanText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\]\[C1/g, "")
    .replace(/\]\[d2/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function normalizeBarcodeBaseForMatch(v: unknown): string {
  return normalizeScanText(v);
}

export function normalizeLot(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.toUpperCase() === LOT_NULL_PLACEHOLDER) return null;
  return s.toUpperCase();
}

export function normalizeExpInput(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === EXP_NULL_PLACEHOLDER) return null;
  return s;
}

export function toDateOnlyKey(
  d: Date | string | null | undefined,
): string | null {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}

export function sameDateOnly(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  return toDateOnlyKey(a) === toDateOnlyKey(b);
}

export function sameExpDateOnly(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  const ak = toDateOnlyKey(a);
  const bk = toDateOnlyKey(b);
  if (!ak && !bk) return true;
  return ak === bk;
}

export function parseYYMMDDToDate(v: string | null | undefined): Date | null {
  const s = String(v ?? "").trim();
  if (!/^\d{6}$/.test(s) || s === EXP_NULL_PLACEHOLDER) return null;

  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isPositiveIndex(v: unknown): v is number {
  return Number.isInteger(v) && Number(v) > 0;
}

export function isZeroLikeIndex(v: unknown): boolean {
  return Number(v ?? 0) === 0;
}

export function isNullLikeLot(v: unknown): boolean {
  const s = String(v ?? "").trim().toUpperCase();
  return !s || s === LOT_NULL_PLACEHOLDER;
}

export function isNullLikeExp(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return !s || s === EXP_NULL_PLACEHOLDER;
}

export function safeSliceByOneBased(
  input: string,
  start?: number | null,
  stop?: number | null,
): string | null {
  if (!isPositiveIndex(start) || !isPositiveIndex(stop) || stop < start) {
    return null;
  }

  const zeroStart = start - 1;
  const zeroStopExclusive = stop;

  if (zeroStart >= input.length) return null;
  return input.slice(zeroStart, Math.min(zeroStopExclusive, input.length));
}

export function hasFixedLotExpMeta(
  meta?: {
    lot_start?: number | null;
    lot_stop?: number | null;
    exp_start?: number | null;
    exp_stop?: number | null;
  } | null,
): boolean {
  if (!meta) return false;

  const lotZero =
    isZeroLikeIndex(meta.lot_start) && isZeroLikeIndex(meta.lot_stop);
  const expZero =
    isZeroLikeIndex(meta.exp_start) && isZeroLikeIndex(meta.exp_stop);

  if (lotZero && expZero) return false;

  return (
    isPositiveIndex(meta.lot_start) &&
    isPositiveIndex(meta.lot_stop) &&
    isPositiveIndex(meta.exp_start) &&
    isPositiveIndex(meta.exp_stop)
  );
}

/**
 * ใช้ตัดสินว่า master barcode นี้ "อนุญาต" ให้ parse แบบ GS1_AI ได้หรือไม่
 * requirement:
 * - ถ้ามี field ไหนเป็น 0 / null / undefined แม้แต่ตัวเดียว => ห้ามใช้ GS1_AI
 * - ต้องมี lot/exp positions ครบทุกตัวและเป็นค่าบวกทั้งหมด
 */
export function canUseGS1AIByMaster(
  meta?: {
    lot_start?: number | null;
    lot_stop?: number | null;
    exp_start?: number | null;
    exp_stop?: number | null;
  } | null,
): boolean {
  if (!meta) return false;

  return (
    isPositiveIndex(meta.lot_start) &&
    isPositiveIndex(meta.lot_stop) &&
    isPositiveIndex(meta.exp_start) &&
    isPositiveIndex(meta.exp_stop)
  );
}

export function parseScannedBarcodeByBaseBarcode(
  scannedBarcode: string,
  baseBarcodeText: string,
) {
  const raw = normalizeScanText(scannedBarcode);
  const base = normalizeScanText(baseBarcodeText);

  if (!raw.startsWith(base)) {
    return {
      barcode_text: base,
      lot_serial: null,
      exp_text: EXP_NULL_PLACEHOLDER,
      exp: null,
    };
  }

  const remain = raw.slice(base.length);

  if (remain.length < 6) {
    return {
      barcode_text: base,
      lot_serial: remain || null,
      exp_text: EXP_NULL_PLACEHOLDER,
      exp: null,
    };
  }

  const exp_text = remain.slice(-6);
  const lot_serial = remain.slice(0, -6) || null;

  return {
    barcode_text: base,
    lot_serial,
    exp_text,
    exp: parseYYMMDDToDate(exp_text),
  };
}

export function parseScannedBarcodeByMasterMeta(input: {
  scannedBarcode: string;
  masterBarcode: string;
  lot_start?: number | null;
  lot_stop?: number | null;
  exp_start?: number | null;
  exp_stop?: number | null;
}) {
  const raw = normalizeScanText(input.scannedBarcode);
  const master = normalizeScanText(input.masterBarcode);

  const useFixedMeta = hasFixedLotExpMeta({
    lot_start: input.lot_start,
    lot_stop: input.lot_stop,
    exp_start: input.exp_start,
    exp_stop: input.exp_stop,
  });

  // ไม่มี fixed meta จริง -> treat เป็น base barcode only
  if (!useFixedMeta) {
    if (raw === master) {
      return {
        barcode_text: master,
        lot_serial: null,
        exp_text: EXP_NULL_PLACEHOLDER,
        exp: null,
        normalized_scan: raw,
        matched_by: "BASE_SUFFIX" as const,
      };
    }

    return {
      ...parseScannedBarcodeByBaseBarcode(raw, master),
      normalized_scan: raw,
      matched_by: "BASE_SUFFIX" as const,
    };
  }

  if (!raw.startsWith("01")) {
    return {
      ...parseScannedBarcodeByBaseBarcode(raw, master),
      normalized_scan: raw,
      matched_by: "BASE_SUFFIX" as const,
    };
  }

  const barcodeTextPart = raw.slice(2, master.length + 2);

  if (barcodeTextPart !== master) {
    return {
      barcode_text: master,
      lot_serial: null,
      exp_text: EXP_NULL_PLACEHOLDER,
      exp: null,
      normalized_scan: raw,
      matched_by: "FIXED_META" as const,
    };
  }

  const lot_serial =
    safeSliceByOneBased(raw, input.lot_start ?? null, input.lot_stop ?? null) ??
    null;

  const exp_text =
    safeSliceByOneBased(raw, input.exp_start ?? null, input.exp_stop ?? null) ??
    EXP_NULL_PLACEHOLDER;

  return {
    barcode_text: barcodeTextPart,
    lot_serial,
    exp_text,
    exp: parseYYMMDDToDate(exp_text),
    normalized_scan: `${barcodeTextPart}${lot_serial ?? ""}${exp_text === EXP_NULL_PLACEHOLDER ? "" : exp_text}`,
    matched_by: "FIXED_META" as const,
  };
}

/**
 * GS1 parser:
 * - 01 = GTIN14
 * - 10 = LOT (variable)
 * - 17 = EXP YYMMDD
 */
export function parseGS1AIBarcode(scannedBarcode: string) {
  const raw = normalizeScanText(scannedBarcode);
  if (!raw.startsWith("01")) return null;
  if (raw.length < 16) return null;

  const barcode_text = raw.slice(2, 16);

  let cursor = 16;
  let lot_serial: string | null = null;
  let exp_text: string | null = null;

  while (cursor < raw.length) {
    const ai2 = raw.slice(cursor, cursor + 2);

    if (ai2 === "17") {
      const value = raw.slice(cursor + 2, cursor + 8);
      if (/^\d{6}$/.test(value)) {
        exp_text = value;
        cursor += 8;
        continue;
      }
      break;
    }

    if (ai2 === "10") {
      cursor += 2;
      let nextCursor = raw.length;

      const ai17Index = raw.indexOf("17", cursor);
      if (ai17Index !== -1) nextCursor = Math.min(nextCursor, ai17Index);

      const value = raw.slice(cursor, nextCursor);
      lot_serial = value || null;
      cursor = nextCursor;
      continue;
    }

    break;
  }

  return {
    barcode_text,
    lot_serial,
    exp_text: exp_text ?? EXP_NULL_PLACEHOLDER,
    exp: parseYYMMDDToDate(exp_text ?? EXP_NULL_PLACEHOLDER),
    normalized_scan: raw,
    matched_by: "GS1_AI" as const,
  };
}

export async function findMasterBarcodeForScan(scannedBarcode: string) {
  const raw = normalizeScanText(scannedBarcode);

  if (raw.startsWith("01") && raw.length >= 16) {
    const gtin14 = raw.slice(2, 16);

    const byGtin = await prisma.barcode.findFirst({
      where: {
        barcode: gtin14,
        deleted_at: null,
        active: true,
      },
      select: {
        id: true,
        barcode: true,
        lot_start: true,
        lot_stop: true,
        exp_start: true,
        exp_stop: true,
        barcode_length: true,
        product_id: true,
      },
    });

    if (byGtin) return byGtin;
  }

  const byDirect = await prisma.barcode.findFirst({
    where: {
      barcode: raw,
      deleted_at: null,
      active: true,
    },
    select: {
      id: true,
      barcode: true,
      lot_start: true,
      lot_stop: true,
      exp_start: true,
      exp_stop: true,
      barcode_length: true,
      product_id: true,
    },
  });

  return byDirect;
}

/**
 * สำหรับ borrow เดิม:
 * prefix longest match จาก master barcode
 * แล้วถือว่า 6 ตัวท้าย = exp, ตรงกลาง = lot
 */
export async function resolveBarcodeTextLotExpFromPayload(payload: string) {
  const text = normalizeScanText(payload);
  if (!text) throw badRequest("กรุณาส่ง barcode");
  if (text.length < 7) throw badRequest(`barcode payload สั้นเกินไป: ${text}`);

  const masters = await prisma.barcode.findMany({
    where: { deleted_at: null, active: true },
    select: {
      id: true,
      barcode: true,
      lot_start: true,
      lot_stop: true,
      exp_start: true,
      exp_stop: true,
    },
  });

  let matchedMaster: (typeof masters)[number] | null = null;
  for (const m of masters) {
    const b = normalizeScanText(m.barcode);
    if (!b) continue;
    if (text.startsWith(b)) {
      if (
        !matchedMaster ||
        b.length > normalizeScanText(matchedMaster.barcode).length
      ) {
        matchedMaster = m;
      }
    }
  }

  if (!matchedMaster) {
    throw badRequest(`ไม่พบ barcode master ที่ match payload: ${text}`);
  }

  const parsed = hasFixedLotExpMeta(matchedMaster)
    ? parseScannedBarcodeByMasterMeta({
        scannedBarcode: text,
        masterBarcode: matchedMaster.barcode,
        lot_start: matchedMaster.lot_start,
        lot_stop: matchedMaster.lot_stop,
        exp_start: matchedMaster.exp_start,
        exp_stop: matchedMaster.exp_stop,
      })
    : parseScannedBarcodeByBaseBarcode(text, matchedMaster.barcode);

  return {
    payload: text,
    barcode_text: parsed.barcode_text,
    lot_serial: normalizeLot(parsed.lot_serial),
    exp_text: parsed.exp_text,
    exp: parsed.exp,
    matched_by: "MASTER_PREFIX" as const,
    master_barcode_id: matchedMaster.id,
  };
}

/**
 * ตัวเดียวจบสำหรับทุก ctl
 * ลองตามลำดับ:
 * 1) ถ้าขึ้นต้น 01 จะใช้ GS1 ได้ ก็ต่อเมื่อ master barcode อนุญาตจริง
 * 2) master barcode (fixed meta / base suffix)
 * 3) borrow-style master prefix
 */
export async function resolveBarcodeScan(
  scannedBarcode: string,
): Promise<ResolvedScanResult> {
  const raw = String(scannedBarcode ?? "").trim();
  const normalized = normalizeScanText(raw);

  if (!normalized) throw badRequest("กรุณาส่ง barcode");

  const masterBc = await findMasterBarcodeForScan(normalized);

  // ✅ ใช้ GS1_AI เฉพาะเมื่อขึ้นต้น 01 และ master metadata ครบจริงเท่านั้น
  if (normalized.startsWith("01") && canUseGS1AIByMaster(masterBc)) {
    const gs1Parsed = parseGS1AIBarcode(normalized);

    if (gs1Parsed?.barcode_text) {
      return {
        raw_input: raw,
        normalized_input: normalized,
        matched_by: "GS1_AI",
        barcode_text: gs1Parsed.barcode_text,
        lot_serial: normalizeLot(gs1Parsed.lot_serial),
        exp_text: gs1Parsed.exp_text,
        exp: gs1Parsed.exp,
        master_barcode_id: masterBc?.id ?? null,
      };
    }
  }

  // ✅ ถ้า master เจอ แต่ใช้ GS1 ไม่ได้ ให้ fallback เป็น barcode ปกติทันที
  if (masterBc) {
    const parsed = parseScannedBarcodeByMasterMeta({
      scannedBarcode: normalized,
      masterBarcode: String(masterBc.barcode ?? ""),
      lot_start: masterBc.lot_start,
      lot_stop: masterBc.lot_stop,
      exp_start: masterBc.exp_start,
      exp_stop: masterBc.exp_stop,
    });

    return {
      raw_input: raw,
      normalized_input: normalized,
      matched_by:
        parsed.matched_by === "FIXED_META" ? "FIXED_META" : "BASE_SUFFIX",
      barcode_text: parsed.barcode_text,
      lot_serial: normalizeLot(parsed.lot_serial),
      exp_text: parsed.exp_text,
      exp: parsed.exp,
      master_barcode_id: masterBc.id ?? null,
    };
  }

  const fallback = await resolveBarcodeTextLotExpFromPayload(normalized);

  return {
    raw_input: raw,
    normalized_input: normalized,
    matched_by: fallback.matched_by,
    barcode_text: fallback.barcode_text,
    lot_serial: fallback.lot_serial,
    exp_text: fallback.exp_text,
    exp: fallback.exp,
    master_barcode_id: fallback.master_barcode_id ?? null,
  };
}