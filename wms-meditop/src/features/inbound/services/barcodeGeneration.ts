import { goodinApi } from "../../goodin/services/goodin.api";
import { BarcodeCountDepartmentApi, inboundApi } from "./inbound.api";

export type BarcodeCounterRecord = {
  id: string | number;
  department_code: string;
  barcode_count: string;
};

export type GoodsInBarcodeLike = {
  id: string | number;
  product_id?: number | null;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  barcode_text?: string | null;
  barcode?: {
    barcode?: string | null;
  } | null;
};

const unwrapBarcodeCounterList = (raw: any): BarcodeCounterRecord[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.result)) return raw.result;
  return [];
};

const normalizeText = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

export const getGoodsInBarcodeValue = (item?: GoodsInBarcodeLike | null) =>
  String(item?.barcode?.barcode ?? item?.barcode_text ?? "").trim();

export const getGoodsInProductKey = (item?: GoodsInBarcodeLike | null) => {
  if (!item) return "";
  if (item.product_id != null) return `product:${item.product_id}`;

  return [
    "fallback",
    normalizeText(item.code),
    normalizeText(item.name),
    normalizeText(item.unit),
  ].join("|");
};

export const findExistingBarcodeInGroup = (
  targetItem: GoodsInBarcodeLike,
  groupItems: GoodsInBarcodeLike[],
) => {
  const targetKey = getGoodsInProductKey(targetItem);
  if (!targetKey) return "";

  const matched = groupItems.find((item) => {
    return (
      getGoodsInProductKey(item) === targetKey && !!getGoodsInBarcodeValue(item)
    );
  });

  return getGoodsInBarcodeValue(matched);
};

export const prepareBarcodeForGoodsIn = async (goodsInId: string) => {
  const goodinRes = await goodinApi.getById(goodsInId);
  const departmentCode = goodinRes.data?.department_code;

  if (!departmentCode) {
    throw new Error("ไม่พบ department_code");
  }

  const counterRes = await BarcodeCountDepartmentApi.getAll();
  const counters = unwrapBarcodeCounterList(counterRes.data);
  const counterRecord = counters.find(
    (item) => item.department_code === departmentCode,
  );

  if (!counterRecord) {
    throw new Error("ไม่พบ department_code ใน barcode_count_departments");
  }

  const currentCount = Number(counterRecord.barcode_count);
  if (!Number.isFinite(currentCount)) {
    throw new Error("barcode_count ไม่ถูกต้อง");
  }

  const nextNumber = currentCount + 1;
  const nextCount = String(nextNumber).padStart(
    String(counterRecord.barcode_count).length,
    "0",
  );

  return {
    barcode: `${departmentCode}${nextCount}`,
    counterRecord,
    nextCount,
  };
};

export const persistGeneratedBarcode = async (
  goodsInId: string,
  barcode: string,
  counterRecord: BarcodeCounterRecord,
  nextCount?: string,
) => {
  await inboundApi.createGoodinBarcode({
    goods_in_id: goodsInId,
    barcode,
    lot_start: 0,
    lot_stop: 0,
    exp_start: 0,
    exp_stop: 0,
    barcode_length: barcode.length,
  });

  const resolvedNextCount =
    nextCount ??
    String(Number(counterRecord.barcode_count) + 1).padStart(
      String(counterRecord.barcode_count).length,
      "0",
    );

  await BarcodeCountDepartmentApi.update(String(counterRecord.id), {
    barcode_count: resolvedNextCount,
  });
};

export const persistBarcodeToManyGoodsIn = async ({
  goodsInIds,
  barcode,
  counterRecord,
  nextCount,
  shouldAdvanceCounter,
}: {
  goodsInIds: string[];
  barcode: string;
  counterRecord?: BarcodeCounterRecord | null;
  nextCount?: string;
  shouldAdvanceCounter: boolean;
}) => {
  if (goodsInIds.length === 0) return;

  for (const goodsInId of goodsInIds) {
    await inboundApi.createGoodinBarcode({
      goods_in_id: goodsInId,
      barcode,
      lot_start: 0,
      lot_stop: 0,
      exp_start: 0,
      exp_stop: 0,
      barcode_length: barcode.length,
    });
  }

  if (shouldAdvanceCounter) {
    if (!counterRecord) {
      throw new Error("ไม่พบ counter record สำหรับอัปเดต running barcode");
    }

    const resolvedNextCount =
      nextCount ??
      String(Number(counterRecord.barcode_count) + 1).padStart(
        String(counterRecord.barcode_count).length,
        "0",
      );

    await BarcodeCountDepartmentApi.update(String(counterRecord.id), {
      barcode_count: resolvedNextCount,
    });
  }
};

export const ensureSharedBarcodeForGoodsInGroup = async (
  targetItem: GoodsInBarcodeLike,
  groupItems: GoodsInBarcodeLike[],
) => {
  const existingBarcode = findExistingBarcodeInGroup(targetItem, groupItems);

  const targetKey = getGoodsInProductKey(targetItem);
  const sameProductItems = groupItems.filter(
    (item) => getGoodsInProductKey(item) === targetKey,
  );

  const missingGoodsInIds = sameProductItems
    .filter((item) => !getGoodsInBarcodeValue(item))
    .map((item) => String(item.id));

  if (missingGoodsInIds.length === 0) {
    return existingBarcode || getGoodsInBarcodeValue(targetItem);
  }

  if (existingBarcode) {
    await persistBarcodeToManyGoodsIn({
      goodsInIds: missingGoodsInIds,
      barcode: existingBarcode,
      shouldAdvanceCounter: false,
    });

    return existingBarcode;
  }

  const prepared = await prepareBarcodeForGoodsIn(String(targetItem.id));

  await persistBarcodeToManyGoodsIn({
    goodsInIds: missingGoodsInIds,
    barcode: prepared.barcode,
    counterRecord: prepared.counterRecord,
    nextCount: prepared.nextCount,
    shouldAdvanceCounter: true,
  });

  return prepared.barcode;
};

export const createNextBarcodeForGoodsIn = async (goodsInId: string) => {
  const prepared = await prepareBarcodeForGoodsIn(goodsInId);

  await persistGeneratedBarcode(
    goodsInId,
    prepared.barcode,
    prepared.counterRecord,
    prepared.nextCount,
  );

  return prepared.barcode;
};