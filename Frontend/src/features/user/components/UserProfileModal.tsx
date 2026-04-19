// import React, { useEffect, useState } from "react";
// import Modal from "../../../components/Modal/Modal";
// import type { UserType } from "../types/user.type";
// import { userApi } from "../services/user.api";

// type UserProfileModalProps = {
//   isOpen: boolean;
//   onClose: () => void;
//   userId: number | null;
//   onSuccess?: () => void;
// };

// const UserProfileModal = ({
//   isOpen,
//   onClose,
//   userId,
// }: UserProfileModalProps) => {
//   const [user, setUser] = useState<UserType | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [profileUserId, setProfileUserId] = useState<number | null>(null);

//   useEffect(() => {
//   if (!isOpen || !userId) {
//     setUser(null);
//     return;
//   }
//   setProfileUserId(userId);
//   setLoading(true);
//   userApi
//     .getById(userId)
//     .then((res) => {
//       console.log("API response", res.data);
//       // แปลงผ่าน unknown ก่อน cast
//       setUser(res.data as unknown as UserType);
//     })
//     .catch(() => setUser(null))
//     .finally(() => setLoading(false));
// }, [isOpen, userId]);

//   if (!isOpen) return null;

//   return (
//     <Modal
//       isOpen={isOpen}
//       onClose={onClose}
//       title="User Profile"
//       footer={
//         <button className="btn" onClick={onClose}>
//           ปิด
//         </button>
//       }
//     >
//       {loading ? (
//         <div>Loading...</div>
//       ) : !user ? (
//         <div>ไม่พบข้อมูลผู้ใช้</div>
//       ) : (
//         <div className="user-profile-modal-content">
//           <div><b>ชื่อ-นามสกุล:</b> {user.first_name} {user.last_name}</div>
//           <div><b>Email:</b> {user.email}</div>
//           <div><b>เบอร์โทร:</b> {user.tel}</div>
//           <div><b>สิทธิ์:</b> {user.user_level}</div>
//           <div><b>สถานะ:</b> {user.status}</div>
//           <div><b>หมายเหตุ:</b> {user.remark}</div>
//         </div>
//       )}
//     </Modal>
//   );
// };

// export default UserProfileModal;
