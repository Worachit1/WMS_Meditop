// import React, { useEffect, useMemo, useRef, useState } from "react";
// import Select from "react-select";
// import "./addborrow_stock.css";
// import CameraScanner from "./CameraScanner";
// import { borrowStockApi } from "../../services/borrow_stock.api";
// import { departmentApi } from "../../../department/services/department.api";
// import { toast } from "react-toastify";
// import { useNavigate } from "react-router-dom";

// import { confirmAlert } from "../../../../utils/alert";

// type DepartmentOption = {
//   id: number;
//   short_name: string;
// };

// type SelectOption = {
//   value: number;
//   label: string;
//   raw: DepartmentOption;
// };

// type DraftItem = {
//   code: string;
//   name: string | null;
//   lot_serial: string;
//   expiration_date: string | null;
//   system_qty: number;
//   executed_qty: number;
// };

// type Props = {
//   open: boolean;
//   onClose: () => void;
//   onSuccess?: () => void;
// };

// function normalizeScanText(v: unknown) {
//   return String(v ?? "")
//     .trim()
//     .replace(/\s+/g, "");
// }

// function itemKey(
//   it: Pick<DraftItem, "code" | "lot_serial" | "expiration_date">,
// ) {
//   return `${it.code}__${it.lot_serial}__${it.expiration_date ?? ""}`;
// }

// // function buildUserRefFromStorage() {
// //   const first = (localStorage.getItem("first_name") ?? "").trim();
// //   const last = (localStorage.getItem("last_name") ?? "").trim();

// //   const full = `${first} ${last}`.trim();

// //   if (full) return full;

// //   return ""; // backend จะ reject ถ้ายังว่าง
// // }

// const AddBorrowStockModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
//   const navigate = useNavigate();
//   const [loading, setLoading] = useState(false);

//   const [locationFullName, setLocationFullName] = useState("");
//   const [lockedLocation, setLockedLocation] = useState<{
//     id: number;
//     name: string;
//   } | null>(null);

//   const [barcodeText, setBarcodeText] = useState("");

//   const [departmentId, setDepartmentId] = useState<number | "">("");
//   const [departmentOpt, setDepartmentOpt] = useState<SelectOption | null>(null);
//   const [deptOptions, setDeptOptions] = useState<SelectOption[]>([]);
//   const [deptLoading, setDeptLoading] = useState(false);

//   const [remark, setRemark] = useState("");

//   const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
//   const [skuFilter, setSkuFilter] = useState("");

//   const [openScanLocationCam, setOpenScanLocationCam] = useState(false);
//   const [openScanBarcodeCam, setOpenScanBarcodeCam] = useState(false);

//   const locationRef = useRef<HTMLInputElement | null>(null);
//   const barcodeRef = useRef<HTMLInputElement | null>(null);

//   // ================================
//   // Reset modal
//   // ================================
//   useEffect(() => {
//     if (!open) return;

//     setLoading(false);
//     setLocationFullName("");
//     setLockedLocation(null);
//     setBarcodeText("");
//     setDepartmentId("");
//     setDepartmentOpt(null);
//     setRemark("");
//     setDraftItems([]);
//     setSkuFilter("");
//     setOpenScanLocationCam(false);
//     setOpenScanBarcodeCam(false);

//     setTimeout(() => locationRef.current?.focus(), 50);
//   }, [open]);

//   // ================================
//   // Load Departments
//   // ================================
//   useEffect(() => {
//     if (!open) return;

//     const load = async () => {
//       setDeptLoading(true);
//       try {
//         const res = await departmentApi.getAll();

//         // ✅ normalize ให้รองรับหลายรูปแบบของ API response
//         const raw = res?.data;
//         const list: any[] = Array.isArray(raw)
//           ? raw
//           : Array.isArray(raw?.data)
//             ? raw.data
//             : Array.isArray(raw?.departments)
//               ? raw.departments
//               : [];

//         const opts: SelectOption[] = list
//           .filter((d) => Number(d?.id) > 0)
//           .map((d) => {
//             const label = String(
//               d?.short_name ?? d?.full_name ?? `Dept ${d?.id ?? ""}`,
//             );
//             return {
//               value: Number(d.id),
//               label,
//               raw: {
//                 id: Number(d.id),
//                 short_name: String(d?.short_name ?? ""),
//               },
//             };
//           })
//           .sort((a, b) => a.label.localeCompare(b.label));

//         setDeptOptions(opts);
//       } catch (e) {
//         toast.error("โหลด Department ไม่สำเร็จ");
//         setDeptOptions([]);
//       } finally {
//         setDeptLoading(false);
//       }
//     };

//     load();
//   }, [open]);

//   const canScanBarcode = !!lockedLocation;
//   const canConfirm =
//     !!lockedLocation &&
//     departmentId !== "" &&
//     draftItems.length > 0 &&
//     !loading;

//   const filteredItems = useMemo(() => {
//     const q = skuFilter.trim().toLowerCase();
//     if (!q) return draftItems;
//     return draftItems.filter((it) => it.code.toLowerCase().includes(q));
//   }, [draftItems, skuFilter]);

//   // ================================
//   // Scan Location
//   // ================================
//   const handleScanLocation = async (rawText?: string) => {
//     const loc = String(rawText ?? locationFullName ?? "").trim();
//     if (!loc) return;

//     setLoading(true);
//     try {
//       const res = await borrowStockApi.scanLocation({
//         location_full_name: loc,
//       });

//       toast.success(`ล็อค Location: ${res.data.location.location_name}`);

//       setLockedLocation({
//         id: res.data.location.location_id,
//         name: res.data.location.location_name,
//       });

//       setLocationFullName(res.data.location.location_name);

//       setTimeout(() => {
//         barcodeRef.current?.focus();
//         barcodeRef.current?.select?.();
//       }, 50);
//     } catch (err: any) {
//       const msg =
//         err?.response?.data?.message ||
//         err?.message ||
//         "สแกน Location ไม่สำเร็จ";
//       toast.error(msg);
//     } finally {
//       setLoading(false);
//     }
//   };
//   const handleUnlockLocation = () => {
//     if (loading) return;

//     if (draftItems.length > 0) {
//       const ok = confirm(
//         "จะเปลี่ยน Location และล้างรายการสินค้าในตารางทั้งหมดใช่ไหม?",
//       );
//       if (!ok) return;
//     }
//     toast.info("ปลดล็อค Location");
//     setLockedLocation(null);
//     setDraftItems([]);
//     setBarcodeText("");
//     setTimeout(() => locationRef.current?.focus(), 50);
//   };

//   // ================================
//   // Scan Barcode
//   // ================================
//   const handleScanBarcode = async (rawText?: string) => {
//     if (!lockedLocation) {
//       toast.warning("กรุณาสแกน Location ก่อน");
//       return;
//     }

//     const bc = normalizeScanText(rawText ?? barcodeText);
//     if (!bc) return;

//     setLoading(true);
//     try {
//       const res = await borrowStockApi.scanBarcodePreview({
//         barcode: bc,
//         location_full_name: lockedLocation.name,
//       });

//       const it = res.data.item;

//       const next: DraftItem = {
//         code: it.code,
//         name: it.name,
//         lot_serial: it.lot_serial,
//         expiration_date: it.expiration_date,
//         system_qty: Number(it.system_qty ?? 0),
//         executed_qty: 0,
//       };

//       setDraftItems((prev) => {
//         const k = itemKey(next);
//         if (prev.some((x) => itemKey(x) === k)) {
//           toast.info("รายการนี้มีอยู่แล้ว");
//           return prev;
//         }
//         return [...prev, next];
//       });

//       setBarcodeText("");

//       setTimeout(() => {
//         barcodeRef.current?.focus();
//         barcodeRef.current?.select?.();
//       }, 30);
//     } catch (err: any) {
//       const msg =
//         err?.response?.data?.message ||
//         err?.message ||
//         "สแกน Code/Serial ไม่สำเร็จ";
//       toast.error(msg);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const updateExecutedQty = (idx: number, value: string) => {
//     const n = Number(value);
//     const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;

//     setDraftItems((prev) => {
//       const copy = [...prev];
//       copy[idx] = { ...copy[idx], executed_qty: safe };
//       return copy;
//     });
//   };

//   const deleteDraftItem = async (idx: number) => {
//     const result = await confirmAlert("ลบรายการนี้?");
//     if (!result.isConfirmed) return;
//     setDraftItems((prev) => prev.filter((_, i) => i !== idx));
//   };

//   // ================================
//   // Confirm
//   // ================================
//   const handleConfirm = async () => {
//     if (!lockedLocation) return alert("กรุณาสแกน Location ก่อน");
//     if (departmentId === "") return alert("กรุณาเลือก Department");
//     if (draftItems.length === 0)
//       return alert("กรุณาสแกนรายการอย่างน้อย 1 รายการ");

//     // const userRef = buildUserRefFromStorage();

//     // if (!userRef) {
//     //   toast.error("ไม่พบชื่อผู้ใช้งาน (กรุณาตั้งค่า first_name/last_name)");
//     //   return;
//     // }

//     setLoading(true);
//     try {
//       await borrowStockApi.start({
//         location_full_name: lockedLocation.name,
//         department_id: Number(departmentId),
//         // user_ref: userRef, // ✅ ส่งไป
//         remark: remark ?? null,
//         items: draftItems.map((x) => ({
//           code: x.code,
//           name: x.name,
//           lot_serial: x.lot_serial,
//           expiration_date: x.expiration_date,
//           system_qty: x.system_qty,
//           executed_qty: x.executed_qty,
//         })),
//       });

//       toast.success("เริ่มต้น Borrow Stock เรียบร้อยแล้ว");
//       onClose();
//       onSuccess?.();
//       navigate("/borrow_stocks");
//     } catch (err: any) {
//       const msg =
//         err?.response?.data?.message ||
//         err?.message ||
//         "สร้าง Borrow Stock ไม่สำเร็จ";
//       toast.error(msg);
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (!open) return null;

//   return (
//     <div className="addborrow_stock-backdrop" role="dialog" aria-modal="true">
//       <div className="addborrow_stock-modal">
//         <div className="addborrow_stock-header">
//           <div className="addborrow_stock-title">Borrow Stock</div>
//           <button
//             className="addborrow_stock-close"
//             onClick={onClose}
//             type="button"
//             disabled={loading}
//           >
//             ✕
//           </button>
//         </div>

//         <div className="addborrow_stock-body">
//           {/* FORM */}
//           <div className="addborrow_stock-form">
//             {/* Location */}
//             <div className="addborrow_stock-row">
//               <label className="addborrow_stock-label">Location</label>

//               <div className="addborrow_stock-inputwrap">
//                 <input
//                   ref={locationRef}
//                   className="addborrow_stock-input"
//                   placeholder="Scan Location"
//                   value={locationFullName}
//                   onChange={(e) => setLocationFullName(e.target.value)}
//                   disabled={loading || !!lockedLocation}
//                   onKeyDown={(e) => {
//                     if (e.key === "Enter") {
//                       e.preventDefault();
//                       handleScanLocation();
//                     }
//                   }}
//                 />
//                 <div className="addborrow_stock-iconwrap">
//                   <button
//                     type="button"
//                     className="addborrow_stock-iconbtn"
//                     onClick={() => setOpenScanLocationCam(true)}
//                     disabled={loading || !!lockedLocation}
//                   >
//                     <i className="fa fa-qrcode" />
//                   </button>

//                   {lockedLocation && (
//                     <button
//                       type="button"
//                       className="addborrow_stock-iconbtn addborrow_stock-iconbtn-warn"
//                       onClick={handleUnlockLocation}
//                       disabled={loading}
//                     >
//                       ↺
//                     </button>
//                   )}
//                 </div>
//               </div>
//             </div>

//             {/* Department */}
//             <div className="addborrow_stock-row">
//               <label className="addborrow_stock-label">Department</label>

//               <Select
//                 classNamePrefix="rs"
//                 isSearchable
//                 isClearable
//                 isDisabled={loading}
//                 isLoading={deptLoading}
//                 placeholder="พิมพ์เพื่อค้นหา หรือเลือก Department"
//                 options={deptOptions}
//                 value={departmentOpt}
//                 getOptionLabel={(o) => o.label} // ✅ กัน render object
//                 getOptionValue={(o) => String(o.value)} // ✅ กัน value เป็น object
//                 onChange={(opt) => {
//                   const v = (opt as SelectOption | null) ?? null;
//                   setDepartmentOpt(v);
//                   setDepartmentId(v ? v.value : "");
//                 }}
//                 noOptionsMessage={() => "ไม่พบ Department"}
//               />
//             </div>

//             {/* Remark */}
//             {/* <div className="addborrow_stock-row">
//               <label className="addborrow_stock-label">Remark</label>
//               <input
//                 className="addborrow_stock-input"
//                 placeholder="หมายเหตุ"
//                 value={remark}
//                 onChange={(e) => setRemark(e.target.value)}
//                 disabled={loading}
//               />
//             </div> */}
//           </div>

//           {/* TABLE */}
//           {/* <div className="addborrow_stock-sectiontitle">Item Verification</div> */}
//           <div className="addborrow_stock-toolbar-sticky">
//             <div className="addborrow_stock-toolbar">
//               <div className="addborrow_stock-toolbar-col">
//                 <label className="addborrow_stock-toolbar-label">
//                   Filter SKU
//                 </label>
//                 <input
//                   className="addborrow_stock-filterinput"
//                   placeholder="Filter SKU"
//                   value={skuFilter}
//                   onChange={(e) => setSkuFilter(e.target.value)}
//                   disabled={loading}
//                 />
//               </div>

//               <div className="addborrow_stock-toolbar-col addborrow_stock-toolbar-col-right">
//                 <label className="addborrow_stock-toolbar-label addborrow_stock-toolbar-label-right">
//                   Code / Serial
//                 </label>

//                 <div className="addborrow_stock-inputwrap addborrow_stock-inputwrap-single">
//                   <input
//                     ref={barcodeRef}
//                     className="addborrow_stock-input"
//                     placeholder="Scan Code/Serial"
//                     value={barcodeText}
//                     onChange={(e) => setBarcodeText(e.target.value)}
//                     disabled={loading || !canScanBarcode}
//                     onKeyDown={(e) => {
//                       if (e.key === "Enter") {
//                         e.preventDefault();
//                         handleScanBarcode();
//                       }
//                     }}
//                   />

//                   <div className="addborrow_stock-iconwrap addborrow_stock-iconwrap-single">
//                     <button
//                       type="button"
//                       className="addborrow_stock-iconbtn"
//                       onClick={() => setOpenScanBarcodeCam(true)}
//                       disabled={loading || !canScanBarcode}
//                     >
//                       <i className="fa fa-qrcode" />
//                     </button>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </div>
//           <div className="addborrow_stock-tablewrap">
//             <table className="addborrow_stock-table">
//               <thead>
//                 <tr>
//                   <th style={{ width: 70 }}>No</th>
//                   <th>SKU</th>
//                   <th style={{ width: 160 }}>System QTY</th>
//                   <th style={{ width: 180 }}>QTY Executed</th>
//                   <th style={{ width: 90 }}>Action</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filteredItems.length === 0 ? (
//                   <tr>
//                     <td colSpan={5} className="addborrow_stock-nodata">
//                       {lockedLocation
//                         ? "สแกน Code/Serial เพื่อเพิ่มรายการ"
//                         : "เริ่มจากสแกน Location ก่อน"}
//                     </td>
//                   </tr>
//                 ) : (
//                   filteredItems.map((it, idx) => (
//                     <tr key={itemKey(it)}>
//                       <td>{idx + 1}</td>
//                       <td>{it.code}</td>
//                       <td>{it.system_qty}</td>
//                       <td>
//                         <input
//                           className="addborrow_stock-qtyinput"
//                           value={String(it.executed_qty)}
//                           onChange={(e) =>
//                             updateExecutedQty(idx, e.target.value)
//                           }
//                         />
//                       </td>
//                       <td>
//                         <button
//                           className="addborrow_stock-btn-danger"
//                           type="button"
//                           onClick={() => deleteDraftItem(idx)}
//                         >
//                           <i className="fa fa-trash" />
//                         </button>
//                       </td>
//                     </tr>
//                   ))
//                 )}
//               </tbody>
//             </table>
//           </div>

//           {/* FOOTER */}
//           <div className="addborrow_stock-footer">
//             <button
//               className="addborrow_stock-btn addborrow_stock-btn-ghost"
//               onClick={onClose}
//               disabled={loading}
//             >
//               Cancel
//             </button>

//             <button
//               className="addborrow_stock-btn addborrow_stock-btn-primary"
//               onClick={handleConfirm}
//               disabled={!canConfirm}
//             >
//               Confirm
//             </button>
//           </div>
//         </div>
//       </div>

//       <CameraScanner
//         open={openScanLocationCam}
//         onClose={() => setOpenScanLocationCam(false)}
//         onDetected={(text) => {
//           const scanned = String(text ?? "").trim();
//           setLocationFullName(scanned);
//           setTimeout(() => handleScanLocation(scanned), 0);
//         }}
//       />

//       <CameraScanner
//         open={openScanBarcodeCam}
//         onClose={() => setOpenScanBarcodeCam(false)}
//         onDetected={(text) => {
//           const scanned = normalizeScanText(text);
//           setBarcodeText(scanned);
//           setTimeout(() => handleScanBarcode(scanned), 0);
//         }}
//       />
//     </div>
//   );
// };

// export default AddBorrowStockModal;
