// careers-page content that isn't per-role. the requirements below are the
// real qualification questions the application already asks (see
// careers/apply/actions.js), just surfaced up front so nobody finds out
// halfway through the form.

// a requirement can carry a `note`, which marks it with an asterisk and prints
// the explanation under the list. transporting clients has a real insurance
// condition attached, so it can't sit there as a bare checkbox.
export const REQUIREMENTS = [
  { label: "A valid California driver's license" },
  { label: "A reliable vehicle" },
  { label: "Current auto insurance" },
  { label: "Current vehicle registration" },
  {
    label: "Willingness to transport clients",
    note: "Driving clients requires auto insurance that covers transporting clients for work. If your policy doesn't cover it yet, that's something we'll go over with you.",
  },
];

// the form asks about these too, but as a plus rather than a gate
export const NICE_TO_HAVE = [
  "Experience supporting people with disabilities",
  "Familiarity with behavioral support plans",
  "Bilingual skills",
  "DSP training",
];

// real quotes from staff, so the careers page isn't only our own marketing
// voice. `approved` means the person actually said it and is fine with it
// being published. anything still false is a draft: it shows while developing
// so it can be edited in place, and is filtered out of the production build so
// a made-up testimonial can never go live under a real person's name.
export const STAFF_QUOTES = [
  {
    approved: true,
    body: "Working here gave me a new perspective on life. A lot of the people we work with have spent their whole lives being told what they can't do. You get to be the person who keeps pushing because you can see what they're actually capable of. That's the part that fills you up.",
    name: "Mánu",
    title: "Independent Living Instructor",
  },
  {
    approved: true,
    body: "I worked full time here and finished my bachelor's at the same time. The schedule is built around your availability and the client's, so it flexes with what's going on in your life instead of fighting it. I don't think I could have done school any other way.",
    name: "Brandon",
    title: "Independent Living Instructor",
  },
  {
    // DRAFT - written by us, not said by a real person yet
    approved: false,
    body: "I came in with no experience in this field and I wasn't sure I'd be any good at it. The training and the people around me made the difference. A year in, I can't picture doing anything else.",
    name: "Alex",
    title: "Independent Living Instructor",
  },
  {
    // DRAFT - written by us, not said by a real person yet
    approved: false,
    body: "I've never sat at a desk all day here. One morning you're helping someone practice cooking, that afternoon you're out in the community or at a job site. If you want every day to look the same, this isn't the job. If you don't, it's the best one I've had.",
    name: "Kam",
    title: "Independent Living Instructor",
  },
];

// only publish what someone actually approved
export const PUBLISHED_QUOTES =
  process.env.NODE_ENV === "production"
    ? STAFF_QUOTES.filter((q) => q.approved)
    : STAFF_QUOTES;

// confirmed by Mánu. the section only renders when this has entries, so it
// stays empty rather than describing a process we made up.
export const HIRING_STEPS = [
  {
    title: "Apply online",
    body: "Tell us about your experience, add your references, and upload a resume.",
  },
  {
    title: "We reach out",
    body: "A short conversation about the role and what you're looking for.",
  },
  {
    title: "Interview",
    body: "Meet the program team you'd be working with.",
  },
  {
    title: "Onboarding",
    body: "Background check and training before you start.",
  },
];
