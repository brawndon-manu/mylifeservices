"use client";

import { Check, X } from "lucide-react";
import styles from "./AttendanceMarkControl.module.css";

const OPTIONS = [
  { value: "present", label: "Present", Icon: Check },
  { value: "absent", label: "Absent", Icon: X },
];

export default function AttendanceMarkControl({ value, onChange, personName }) {
  const status = value === "present" || value === "absent" ? value : null;
  const groupLabel = personName ? `Attendance for ${personName}` : "Attendance status";

  return (
    <div className={styles.control} role="group" aria-label={groupLabel}>
      {OPTIONS.map(({ value: option, label, Icon }) => {
        const selected = status === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            data-selected={selected}
            data-tone={option}
            title={selected ? `Clear ${label.toLowerCase()} mark` : `Mark ${label.toLowerCase()}`}
            onClick={() => onChange(selected ? "" : option)}
            className={styles.option}
          >
            {selected && (
              <Icon className={styles.icon} strokeWidth={2.25} aria-hidden="true" />
            )}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
