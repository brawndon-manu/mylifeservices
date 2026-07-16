// gender is an optional field on the job application. kept minimal + respectful:
// it's only shown when the applicant provided it, and its one bit of UI weight is
// tinting the little initials avatar in the admin list (blue / pink / a distinct
// color for non-binary, neutral otherwise).
export const GENDERS = ["Male", "Female", "Non-binary"];

export function avatarGradient(gender) {
  switch ((gender || "").toLowerCase()) {
    case "male":
      return "from-sky-400 to-blue-600";
    case "female":
      return "from-pink-400 to-rose-500";
    case "non-binary":
      return "from-violet-400 to-fuchsia-600";
    default:
      return "from-slate-400 to-slate-600";
  }
}
