import {useCallback} from "react";
import type { LocationType } from "../types/location.type";
import "../location.css"

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import Swal from "sweetalert2";
import { locationApi } from "../services/location.api";

type Props = {
  locations: LocationType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    fullName: boolean;
    building: boolean;
    zone: boolean;
    lockNo: boolean;
    zone_type: boolean;
    ncr_check: boolean;
    ignore: boolean;
    remark: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onAddNew: () => void;
  onEdit: (location: LocationType) => void;
  onDelete: (location: LocationType) => void;
  onPrint: (location: LocationType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const LocationTable = ({
  locations,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  onAddNew,
  onEdit,
  onDelete,
  onPrint,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const truncateRemark = (remark: string, maxLength = 30) => {
    const normalizedRemark = String(remark ?? "");
    if (normalizedRemark.length <= maxLength) return normalizedRemark;
    return `${normalizedRemark.slice(0, maxLength)}...`;
  };

  const openChangeLocationPrintPopup = useCallback(() => {
      const printWindow = window.open("", "_blank", "width=900,height=900");
      if (!printWindow) return;
  
      const qrPayload = "ChangeLocation";
      const locationText = "ChangeLocation";
      const pageWidth = "10.16cm";
      const pageHeight = "10.16cm";
      const qrMm = 84;
      const paddingMm = 2;
      const dashInsetMm = 1;
  
      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Print ChangeLocation</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
  
            @page {
              size: ${pageWidth} ${pageHeight};
              margin: 0;
            }
  
            html, body {
              width: ${pageWidth};
              height: ${pageHeight};
              margin: 0;
              padding: 0;
              overflow: hidden;
              background: #fff;
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
  
            .root {
              width: 100%;
              height: 100%;
              padding: ${paddingMm}mm;
              position: relative;
              display: flex;
              flex-direction: column;
              background: #fff;
            }
  
            .root::before {
              content: "";
              position: absolute;
              left: ${dashInsetMm}mm;
              top: ${dashInsetMm}mm;
              right: ${dashInsetMm}mm;
              bottom: ${dashInsetMm}mm;
              border: 0.2mm dashed #000;
              opacity: 0.35;
              pointer-events: none;
            }
  
            .qr-wrap {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding-top: 4mm;
              padding-bottom: 2mm;
              position: relative;
              z-index: 1;
            }
  
            .qr {
              width: ${qrMm}mm;
              height: ${qrMm}mm;
              display: flex;
              align-items: center;
              justify-content: center;
            }
  
            .qr canvas, .qr img {
              width: 100% !important;
              height: 100% !important;
              display: block;
            }
  
            .fullname {
              width: 100%;
              min-height: 10mm;
              padding: 0 4mm 3mm;
              text-align: center;
              font-weight: 700;
              font-size: 12pt;
              line-height: 1.2;
              word-break: break-word;
              position: relative;
              z-index: 1;
            }
          </style>
  
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        </head>
        <body>
          <div class="root">
            <div class="qr-wrap">
              <div class="qr" id="qrcode"></div>
            </div>
            <div class="fullname">${locationText}</div>
          </div>
  
          <script>
            new QRCode(document.getElementById("qrcode"), {
              text: ${JSON.stringify(qrPayload)},
              width: 1200,
              height: 1200,
              correctLevel: QRCode.CorrectLevel.M
            });
  
            setTimeout(() => {
              window.focus();
              window.print();
            }, 800);
          </script>
        </body>
        </html>
    `);
      printWindow.document.close();
    }, []);

  const tableHeaders = [
    "No",
    "Full Name",
    "Building",
    "Zone",
    "Lock No.",
    "Zone Temp",
    "EXP&NCR",
    "การควบคุมอุณหภูมิ",
    "Remark",
    "Action",
  ];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Location เป็นไฟล์ Excel ใช่หรือไม่?",
    );

    if (result.isConfirmed) {
      try {
        // แสดง loading
        Swal.fire({
          title: "กำลังดึงข้อมูล...",
          text: "กรุณารอสักครู่",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        // ดึงข้อมูลทั้งหมดจาก API โดยไม่มี limit
        const response: any = await locationApi.getAll();

        // รองรับ structure หลายแบบ
        let allLocations = [];
        if (response.data) {
          allLocations = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allLocations || allLocations.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Location ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allLocations.map(
          (location: LocationType, index: number) => ({
            No: index + 1,
            "Full Name": location.full_name,
            Building: location.building.short_name,
            Zone: location.zone.short_name,
            "Lock No.": location.lock_no,
            "Zone Temp": location.zone.zone_type.short_name,
            "EXP&NCR": location.ncr_check ? "EXP&NCR" : "-",
            "การควบคุมอุณหภูมิ": location.ignore ? "ไม่ใช่" : "ใช่",
            Remark: location.remark,
          }),
        );

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Locations");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Locations_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allLocations.length} รายการเรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (error: any) {
        console.error("Export error:", error);
        Swal.fire({
          icon: "error",
          title: "Export ไม่สำเร็จ",
          text: error?.response?.data?.message || "เกิดข้อผิดพลาด",
        });
      }
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Location</div>

        <div className="toolbar">
          <div className="search-box">
            <i className="fa fa-search search-icon" />

            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={onSearchChange}
            />

            {searchQuery && (
              <button
                type="button"
                className="clear-btn"
                onClick={onClearSearch}
              >
                <i className="fa fa-xmark"></i>
              </button>
            )}
          </div>

          <div className="filter-wrap">
            <button className="filter-btn" onClick={onToggleFilter}>
              <i className="fa fa-filter"></i> Filter
            </button>

            {showFilterDropdown && (
              <div className="filter-dropdown">
                <div className="filter-title">Search In Columns
                  <button
                    type="button"
                    className="filter-clear-btn"
                    onClick={onClearAllColumns}
                  >
                    <i className="fa fa-xmark"></i>
                  </button>
                </div>

                {Object.entries({
                  fullName: "Full Name",
                  building: "Building",
                  zone: "Zone",
                  lockNo: "Lock No.",
                  zone_type: "Zone Temp",
                  ncr_check: "EXP&NCR",
                  ignore: "การควบคุมอุณหภูมิ",
                  remark: "Remark",
                }).map(([key, label]) => (
                  <label className="filter-option" key={key}>
                    <input
                      type="checkbox"
                      checked={
                        searchableColumns[key as keyof typeof searchableColumns]
                      }
                      onChange={() =>
                        onToggleSearchableColumn(
                          key as keyof typeof searchableColumns,
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
           <div>
          <button
            type="button"
            className="location-generate-btn-changlo"
            onClick={openChangeLocationPrintPopup}
          >
            Print ChangeLocation 4×4
          </button>
        </div>
          <IconButton variant="export" onClick={handleExportExcel} />
          <IconButton variant="add" onClick={onAddNew} />
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {locations.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No locations found.
              </td>
            </tr>
          ) : (
            locations.map((location, index) => (
              <tr key={location.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{location.full_name}</td>
                <td>{location.building.short_name}</td>
                <td>{location.zone.short_name}</td>
                <td>{location.lock_no}</td>
                <td>{location.zone.zone_type.short_name}</td>
                <td>{location.ncr_check ? "EXP&NCR" : "-"}</td>
                <td>{location.ignore ? "ไม่ใช่" : "ใช่"}</td>
                <td title={location.remark || ""}>
                  {truncateRemark(location.remark, 30)}
                </td>
                <td>
                  <div className="actions-buttons">
                    <IconButton
                      variant="print"
                      onClick={() => onPrint(location)}
                    />
                    <IconButton
                      variant="edit"
                      onClick={() => onEdit(location)}
                    />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(location)}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default LocationTable;
