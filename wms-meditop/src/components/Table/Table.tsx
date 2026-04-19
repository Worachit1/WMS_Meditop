import type { ReactNode } from "react";

type Props = {
  headers: ReactNode[]; // ✅ รองรับ string/JSX ได้
  children: ReactNode;
};

const Table = ({ headers, children }: Props) => {
  return (
    <table className="app-table">
      <thead>
        <tr>
          {headers.map((h, i) => {
            // ✅ key ต้องเป็น string ที่ unique เสมอ
            const key = typeof h === "string" ? `h-${h}` : `h-${i}`;
            return <th key={key}>{h}</th>;
          })}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
};

export default Table;
