import React, { useEffect, useMemo, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import DetailNavigator from "../../../../components/DetailNavigator/DetailNavigator";
import type { AdjustmentType } from "../../types/adjustment.type";
import { adjustmentApi } from "../../services/adjustment.api";
import Loading from "../../../../components/Loading/Loading";
import "./adjustdetail.css";

// type DetailResponse = { data: AdjustmentType };
type RowItem = any;

function fmtDateTime(v: any) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

// ✅ items ของคุณมีจริง (ตาม response) แต่เผื่ออนาคตไว้
function pickItems(adj: any): RowItem[] {
  const v =
    adj?.items ??
    adj?.lines ??
    adj?.details ??
    adj?.products ??
    adj?.rows ??
    [];
  return Array.isArray(v) ? v : [];
}

const detectSrc = (adj: any): "outbound" | "adjust" => {
  if (adj?.is_system_generated === true) return "outbound";
  if (adj?.is_system_generated === false) return "adjust";

  const source = String(adj?.source ?? "").toLowerCase();
  if (source === "outbound" || source === "adjust") return source;

  if (Object.prototype.hasOwnProperty.call(adj ?? {}, "out_type")) {
    return "outbound";
  }

  return "adjust";
};

const DetailAdjust: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [sp] = useSearchParams();

  const id = Number(params.id);
  const src = (sp.get("src") || "adjust").toLowerCase(); // adjust | outbound

  const [loading, setLoading] = useState(false);
  const [adj, setAdj] = useState<AdjustmentType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [deletingItem, setDeletingItem] = useState<RowItem | null>(null);

  const location = useLocation();
  const navState = useMemo(() => {
    return (location.state as any) || {};
  }, [location.state]);

  const stateDetailList = useMemo(() => {
    return Array.isArray(navState.detailList) ? navState.detailList : [];
  }, [navState.detailList]);

  const navGroup = navState.navGroup;
  const navLevel = navState.level as "manual" | "auto" | undefined;
  const navStatus = navState.status as "pending" | "completed" | undefined;

  const stateDetailTotal = Number(navState.detailTotal ?? 0);

  const [detailList, setDetailList] = useState<
    Array<{ id: number; src: string }>
  >([]);

  const userLabel =
    safeText((adj as any)?.user_ref) !== "-"
      ? safeText((adj as any)?.user_ref)
      : (() => {
          const fn = localStorage.getItem("first_name") || "";
          const ln = localStorage.getItem("last_name") || "";
          const full = `${fn} ${ln}`.trim();
          return full || safeText(localStorage.getItem("user_level"));
        })();

  const openPinModal = (item: RowItem) => {
    setDeletingItem(item);
    setPinErr("");
    setPinValue("");
    setPinOpen(true);

    setTimeout(() => {
      const el = document.getElementById(
        "adj-dt-pin-input",
      ) as HTMLInputElement | null;
      el?.focus();
    }, 50);
  };

  const closePinModal = () => {
    setPinOpen(false);
    setPinValue("");
    setPinErr("");
    setDeletingItem(null);
  };

  const refetchDetail = async () => {
    if (!id || Number.isNaN(id)) return;

    let res: any;
    if (src === "outbound") {
      try {
        res = await adjustmentApi.getDetailOutboundById(id);
      } catch (err: any) {
        if (err?.response?.status === 404) {
          res = await adjustmentApi.getDetailById(id);
        } else {
          throw err;
        }
      }
    } else {
      res = await adjustmentApi.getDetailById(id);
    }

    const raw = res?.data;
    const data: AdjustmentType | null = raw?.data ?? raw ?? null;
    setAdj(data);
  };

  const doDeleteWithPin = async () => {
    const pin = pinValue.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      setPinErr("กรุณากรอก PIN (4-6 หลัก)");
      return;
    }

    if (!adj || !deletingItem?.id) {
      setPinErr("ไม่พบรายการที่ต้องการลบ");
      return;
    }

    try {
      setLoading(true);
      await adjustmentApi.removeItem(
        Number((adj as any).id),
        Number(deletingItem.id),
        pin,
      );
      closePinModal();
      await refetchDetail();
    } catch (err: any) {
      setPinErr(err?.response?.data?.message || "ลบรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!id || Number.isNaN(id)) {
        setErrorMsg("Invalid id");
        return;
      }

      setLoading(true);
      setErrorMsg("");

      try {
        let res: any;

        if (src === "outbound") {
          try {
            res = await adjustmentApi.getDetailOutboundById(id);
          } catch (err: any) {
            if (err?.response?.status === 404) {
              res = await adjustmentApi.getDetailById(id);
            } else {
              throw err;
            }
          }
        } else {
          res = await adjustmentApi.getDetailById(id);
        }

        if (!alive) return;

        const raw = res?.data;

        const data: AdjustmentType | null = raw?.data ?? raw ?? null;

        setAdj(data);
      } catch (e: any) {
        if (!alive) return;
        setErrorMsg(e?.message || "Failed to load detail");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [id, src]);

  useEffect(() => {
    const rows = stateDetailList
      .map((x: any) => ({
        id: Number(x.id),
        src: String(x.src ?? "adjust"),
      }))
      .filter((x: any) => x.id > 0);

    if (rows.length > 0 && rows.length >= stateDetailTotal) {
      setDetailList(rows);
      return;
    }

    // fallback ถ้ากด refresh หรือ state มาไม่ครบ
    const fetchAll = async () => {
      try {
        const limit = 100;
        let page = 1;
        let totalPages = 1;
        const allRows: any[] = [];

        do {
          const resp = await adjustmentApi.getAllPaginated({
            page,
            limit,
            level: navLevel,
            status: navStatus,
          } as any);

          const data = Array.isArray(resp?.data?.data) ? resp.data.data : [];
          const meta = resp?.data?.meta ?? {};

          allRows.push(...data);
          totalPages = Number(meta?.totalPages ?? 1);
          page += 1;
        } while (page <= totalPages);

        setDetailList(
          allRows
            .map((x: any) => ({
              id: Number(x.id),
              src: detectSrc(x),
            }))
            .filter((x: any) => x.id > 0),
        );
      } catch (err) {
        console.error("fetch adjustment nav list error:", err);
        setDetailList(rows);
      }
    };

    fetchAll();
  }, [navGroup, navLevel, navStatus, stateDetailTotal]);

  const items = useMemo(() => pickItems(adj), [adj]);

  // ✅ fallback location จาก header (เพราะ outbound item ไม่มี location/dest ใน item)
  const headerLocation = safeText((adj as any)?.location);
  const headerLocationDest = safeText((adj as any)?.location_dest);

  const isCompleted =
    String((adj as any)?.status ?? "") === "completed" ||
    Boolean((adj as any)?.in_process) === true;

  const currentIndex =
    detailList.findIndex((x) => Number(x.id) === Number(id)) + 1;

  const total = detailList.length;

  const hasNavigator = detailList.length > 0 && currentIndex > 0;

  const handlePrev = () => {
    const idx = detailList.findIndex((x) => Number(x.id) === Number(id));
    if (idx <= 0) return;

    const prev = detailList[idx - 1];

    navigate(`/adjustment/${prev.id}?src=${prev.src}`, {
      state: {
        navGroup,
        level: navLevel,
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  const handleNext = () => {
    const idx = detailList.findIndex((x) => Number(x.id) === Number(id));
    if (idx < 0 || idx >= detailList.length - 1) return;

    const next = detailList[idx + 1];

    navigate(`/adjustment/${next.id}?src=${next.src}`, {
      state: {
        navGroup,
        level: navLevel,
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  return (
    <div className="adj-dt-page">
      <div className="adj-dt-card">
        <div className="adj-dt-title adj-dt-title-with-nav">
          <div>
            <span>Adjust No:</span>
            <span className="adj-dt-title-no">
              {safeText((adj as any)?.no)}
            </span>
          </div>

          {hasNavigator && (
            <DetailNavigator
              currentIndex={currentIndex}
              total={total}
              onPrev={handlePrev}
              onNext={handleNext}
              disablePrev={currentIndex <= 1}
              disableNext={currentIndex >= total}
            />
          )}
        </div>

        <div className="adj-dt-meta">
          <div className="adj-dt-meta-col">
            <div className="adj-dt-meta-row">
              <div className="adj-dt-meta-label">Department :</div>
              <div className="adj-dt-meta-value">
                {safeText((adj as any)?.department ?? (adj as any)?.dept)}
              </div>
            </div>

            <div className="adj-dt-meta-row">
              <div className="adj-dt-meta-label">Description :</div>
              <div className="adj-dt-meta-value">
                {safeText((adj as any)?.description)}
              </div>
            </div>
          </div>

          <div className="adj-dt-meta-col">
            <div className="adj-dt-meta-row">
              <div className="adj-dt-meta-label">Ref Doc:</div>
              <div className="adj-dt-meta-value">
                {safeText(
                  (adj as any)?.reference ??
                    (adj as any)?.origin ??
                    (adj as any)?.ref_doc ??
                    (adj as any)?.ref_no,
                )}
              </div>
            </div>

            <div className="adj-dt-meta-row">
              <div className="adj-dt-meta-label">Date/Time :</div>
              <div className="adj-dt-meta-value">
                {fmtDateTime((adj as any)?.date ?? (adj as any)?.created_at)}
              </div>
            </div>
          </div>
        </div>

        <div className="adj-dt-divider" />

        <div className="adj-dt-table-wrap">
          <table className="adj-dt-table">
            <thead>
              <tr>
                <th className="adj-dt-col-no">No</th>
                <th className="adj-dt-col-code">Code</th>
                <th className="adj-dt-col-name">ชื่อ</th>
                <th className="adj-dt-col-qty">QTY</th>
                <th className="adj-dt-col-uom">หน่วย</th>
                <th className="adj-dt-col-loc">Location</th>
                <th className="adj-dt-col-locdest">Location_dest</th>
                <th className="adj-dt-col-lot">Lot. Serial</th>
                <th className="adj-dt-col-exp">Expire Date</th>
                {!isCompleted && <th className="adj-dt-col-action">Action</th>}
              </tr>
            </thead>

            <tbody>
              {errorMsg ? (
                <tr>
                  <td className="adj-dt-empty" colSpan={isCompleted ? 9 : 10}>
                    {errorMsg}
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td className="adj-dt-empty" colSpan={isCompleted ? 9 : 10}>
                    Loading...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="adj-dt-empty" colSpan={isCompleted ? 9 : 10}>
                    No items found.
                  </td>
                </tr>
              ) : (
                items.map((it: any, idx: number) => {
                  // ✅ qty/unit/lot_serial ตาม response จริง
                  const code = safeText(
                    it?.code ?? it?.product_code ?? it?.sku,
                  );
                  const name = safeText(
                    it?.name ?? it?.product_name ?? it?.title,
                  );
                  const qty = safeText(
                    it?.qty ??
                      it?.quantity ??
                      it?.quantity_count ??
                      it?.quantity_done,
                  );
                  const unit = safeText(it?.unit ?? it?.uom ?? it?.uom_name);

                  // ✅ location fallback จาก header
                  const loc = safeText(
                    it?.location ??
                      it?.location_full_name ??
                      it?.location_name ??
                      headerLocation,
                  );
                  const locDest = safeText(
                    it?.location_dest ??
                      it?.location_dest_full_name ??
                      it?.dest_location ??
                      headerLocationDest,
                  );

                  const lotSerial = safeText(
                    it?.lot_serial ?? it?.lot ?? it?.serial,
                  );

                  // ✅ outbound item ไม่มี exp ในตัวอย่าง -> แสดง "-"
                  const exp =
                    it?.expire_date ??
                    it?.exp_date ??
                    it?.expiration ??
                    it?.exp ??
                    null;

                  return (
                    <tr key={it?.id ? String(it.id) : `row-${idx}`}>
                      <td className="adj-dt-center">{idx + 1}</td>
                      <td>{code}</td>
                      <td>{name}</td>
                      <td className="adj-dt-center">{qty}</td>
                      <td className="adj-dt-center">{unit}</td>
                      <td>{loc}</td>
                      <td>{locDest}</td>
                      <td>{lotSerial}</td>
                      <td>{exp ? fmtDateTime(exp) : "-"}</td>
                      {!isCompleted && (
                        <td className="adj-dt-center">
                          <button
                            type="button"
                            className="adj-dt-delete-btn"
                            onClick={() => openPinModal(it)}
                            disabled={loading}
                          >
                            delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="adj-dt-back-btn"
          onClick={() => navigate("/adjustment")}
        >
          ย้อนกลับ
        </button>
      </div>

      {loading && (
        <div className="adj-dt-loading-overlay">
          <Loading />
        </div>
      )}

      {pinOpen && (
        <div className="adj-dt-pin-backdrop" role="dialog" aria-modal="true">
          <div className="adj-dt-pin-modal">
            <div className="adj-dt-pin-title">Delete Item</div>

            <div className="adj-dt-pin-body">
              <div className="adj-dt-pin-row">
                <div className="adj-dt-pin-label">PIN</div>
                <div className="adj-dt-pin-input-wrap">
                  <input
                    id="adj-dt-pin-input"
                    className="adj-dt-pin-input"
                    value={pinValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setPinValue(v.slice(0, 6));
                      setPinErr("");
                    }}
                    placeholder="6 digits"
                    inputMode="numeric"
                    maxLength={6}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doDeleteWithPin();
                      if (e.key === "Escape") closePinModal();
                    }}
                  />
                  <div className="adj-dt-pin-hint">
                    กรุณาใส่ PIN ของ account ตัวเอง
                  </div>
                </div>
              </div>

              <div className="adj-dt-pin-row">
                <div className="adj-dt-pin-label">User</div>
                <div className="adj-dt-pin-user">{userLabel}</div>
              </div>

              <div className="adj-dt-pin-row">
                <div className="adj-dt-pin-label">Item</div>
                <div className="adj-dt-pin-user">
                  {safeText(deletingItem?.code)} /{" "}
                  {safeText(deletingItem?.lot_serial)}
                </div>
              </div>

              {pinErr ? <div className="adj-dt-pin-error">{pinErr}</div> : null}
            </div>

            <div className="adj-dt-pin-actions">
              <button
                className="adj-dt-pin-btn ghost"
                onClick={closePinModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="adj-dt-pin-btn primary"
                onClick={doDeleteWithPin}
                type="button"
                disabled={loading}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetailAdjust;
