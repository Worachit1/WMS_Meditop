import React from "react";
import "./detailnavigator.css";

type DetailNavigatorProps = {
  currentIndex: number; // 1-based
  total: number;
  onPrev: () => void;
  onNext: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
  className?: string;
};

const DetailNavigator: React.FC<DetailNavigatorProps> = ({
  currentIndex,
  total,
  onPrev,
  onNext,
  disablePrev = false,
  disableNext = false,
  className = "",
}) => {
  return (
    <div className={`detail-nav ${className}`.trim()}>
      <div className="detail-nav__counter">
        {total > 0 ? `${currentIndex}/${total}` : "0/0"}
      </div>

      <div className="detail-nav__actions">
        <button
          type="button"
          className="detail-nav__btn"
          onClick={onPrev}
          disabled={disablePrev}
        >
          <i className="fa-solid fa-chevron-left" />
        </button>

        <button
          type="button"
          className="detail-nav__btn"
          onClick={onNext}
          disabled={disableNext}
        >
          <i className="fa-solid fa-chevron-right" />
        </button>
      </div>
    </div>
  );
};

export default DetailNavigator;