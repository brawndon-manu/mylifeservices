"use client";

// submit button that asks for confirmation before the form's server
// action runs. used for destructive actions (delete). if the user
// cancels the native confirm() dialog we preventDefault so the form
// never submits.
export default function ConfirmButton({
  message = "Are you sure?",
  className,
  children,
  ariaLabel,
}) {
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
