import { useEffect, useMemo, useState } from "react";
import "./pegination.css";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (limit: number) => void;
};

const Pagination = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) => {
  const limitOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  // ✅ Jump input state
  const [jump, setJump] = useState<string>(String(currentPage));

  // sync input เมื่อเปลี่ยนหน้า
  useEffect(() => {
    setJump(String(currentPage));
  }, [currentPage]);

  const clampPage = (p: number) => {
    const last = Math.max(1, totalPages);
    if (!Number.isFinite(p)) return 1;
    return Math.min(Math.max(1, p), last);
  };

  const goToJumpPage = () => {
    const n = Number(jump);
    if (!Number.isFinite(n)) return;

    const target = clampPage(Math.trunc(n));
    if (target !== currentPage) onPageChange(target);
  };

  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];

    if (totalPages <= 1) return [1];

    const first = 1;
    const last = totalPages;
    const siblings = 1;

    // <= 5 แสดงหมด
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    // ช่วงต้น
    if (currentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", last);
      return pages;
    }

    // ช่วงท้าย
    if (currentPage >= last - 3) {
      pages.push(1, "...", last - 4, last - 3, last - 2, last - 1, last);
      return pages;
    }

    // ตรงกลาง
    pages.push(first, "...");
    for (let p = currentPage - siblings; p <= currentPage + siblings; p++) {
      pages.push(p);
    }
    pages.push("...", last);

    return pages;
  }, [currentPage, totalPages]);

  const availableLimitOptions = useMemo(() => {
    return limitOptions.filter(
      (limit) => limit <= totalItems || limit === itemsPerPage
    );
  }, [totalItems, itemsPerPage]);

  const handlePrevious = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  return (
    <div className="pagination-container">
      {/* LEFT */}
      <div className="pagination-left">
        <select
          className="pagination-limit-select"
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
        >
          {availableLimitOptions.map((limit) => (
            <option key={limit} value={limit}>
              {limit} Item
            </option>
          ))}
        </select>
        <span className="pagination-jump-label">Total: {totalItems} Items</span>
      </div>

      {/* CENTER */}
      <div className="pagination-center">
        {pageNumbers.map((page, index) => {
          if (page === "...") {
            return (
              <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                ...
              </span>
            );
          }

          return (
            <button
              key={page}
              className={`pagination-number ${
                currentPage === page ? "active" : ""
              }`}
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </button>
          );
        })}

        {/* ✅ Jump to page */}
        <div className="pagination-jump">
          <span className="pagination-jump-label">Go to</span>
          <input
            className="pagination-jump-input"
            type="number"
            min={1}
            max={Math.max(1, totalPages)}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToJumpPage();
            }}
          />
          <span className="pagination-jump-label">/ {Math.max(1, totalPages)}</span>
          <button className="pagination-btn" onClick={goToJumpPage}>
            Go
          </button>
        </div>
      </div>

      {/* RIGHT */}
      <div className="pagination-right">
        <button
          className="pagination-btn"
          onClick={handlePrevious}
          disabled={currentPage === 1}
        >
          <i className="fa fa-chevron-left" /> Previous
        </button>
        <button
          className="pagination-btn"
          onClick={handleNext}
          disabled={currentPage === totalPages}
        >
          Next <i className="fa fa-chevron-right" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
