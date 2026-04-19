// Sweetalert2 Alert Utility
import Swal from "sweetalert2";
import type { SweetAlertOptions } from "sweetalert2";

import "../index.css";

/* ======================
   Base Config (เหมือนกันทุกอัน)
====================== */
const baseConfig: SweetAlertOptions = {
  allowOutsideClick: false,
  allowEscapeKey: true,
  cancelButtonText: "Cancel",
  confirmButtonText: "Confirm",
  showCancelButton: true,
  customClass: {
    popup: "swal2-custom-popup",
    title: "swal2-custom-title",
    confirmButton: "swal2-custom-confirm",
    cancelButton: "swal2-custom-cancel",
    icon: "swal2-custom-icon",
  },
  reverseButtons: true,
};

/* ======================
   ❓ Question / Confirm
====================== */
export const confirmAlert = (text = "Are you sure ?") => {
  return Swal.fire({
    ...baseConfig,
    icon: "question",
    iconColor: "#0079FF",
    title: "Are you sure ?",
    confirmButtonColor: "#0079FF",
    cancelButtonColor: "#919090CC",
    text,
  });
};

/* ======================
   ❗ Warning
====================== */
export const warningAlert = (text: string) => {
  return Swal.fire({
    ...baseConfig,
    icon: "warning",
    title: "Are you sure ?",
    confirmButtonColor: "#EFC333",
    cancelButtonColor: "#919090CC", 
    text,
  });
};

/* ======================
   🗑 Delete (Trash Icon)
====================== */
export const deleteAlert = () => {
  return Swal.fire({
    title: "Are you sure ?",
    showCancelButton: true,
    confirmButtonText: "Delete",
    cancelButtonText: "Cancel",
    iconHtml: '<i class="fa-solid fa-trash"></i>',
    iconColor: "#e53935",
    customClass: {
      icon: "swal2-trash-icon",
    },
    confirmButtonColor: "#e53935",
    cancelButtonColor: "#919090CC",
    reverseButtons: true,
  });
};

/* ======================
   ✅ Success
====================== */
export const successAlert = (title = "Success", text?: string) => {
  return Swal.fire({
    icon: "success",
    title,
    text,
    showCancelButton: false,
    confirmButtonText: "OK",
  });
};
