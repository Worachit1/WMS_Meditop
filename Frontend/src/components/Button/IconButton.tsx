type Props = {
  variant: "add" | "edit" | "delete" | "upload" | "print" | "detail" | "sync" | "export" | "profile";
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
};

const ICON_MAP = {
  add: "fa-plus",
  edit: "fa-solid fa-pencil",
  delete: "fa-trash",
  upload: "fa-cloud-arrow-up",
  print: "fa-print",
  detail: "fa-solid fa-eye",
  sync: "fa-solid fa-rotate",
  export: "fa-solid fa-file-export",
  profile: "fa-solid fa-user",
};

const LABEL_MAP = {
  add: "Add New",
  edit: "",
  delete: "",
  upload: "",
  print: "",
  detail: "",
  sync: "",
  export: "Export",
  profile: "",
};

const IconButton = ({ variant, onClick, disabled, label }: Props) => {
  const displayLabel = label !== undefined ? label : LABEL_MAP[variant];
  
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      <i className={`fa-solid ${ICON_MAP[variant]}`} />
      {displayLabel && <span>{displayLabel}</span>}
    </button>
  );
};

export default IconButton;
