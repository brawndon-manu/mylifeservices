// per-category explainer content for the Resources page. when a category has
// an entry here, its drilldown view shows an "About ..." callout: a short
// blurb, an optional glossary term with a ? bubble, and an optional
// "Learn more" card (a dismissible modal with a numbered process + safety net).
// add a category key to give it an explainer; categories without one just
// show their resource list. content only, no UI here.

export const CATEGORY_INFO = {
  Housing: {
    blurb:
      "Most housing here is Project-Based Voucher (PBV) housing. Availability shifts often, so call ahead to confirm openings and waitlist status.",
    term: {
      label: "PBV",
      definition:
        "Project-Based Voucher: Section 8 rental assistance tied to a specific unit or building, not the person. The tenant pays about 30% of their income toward rent. In Orange County most PBV units are filled by referral through the Coordinated Entry System (dial 2-1-1); some buildings are set aside for seniors, veterans, or Regional Center clients.",
    },
    learnMore: {
      title: "Project-Based Vouchers (PBV)",
      intro:
        "Section 8 rental assistance tied to a specific unit or building, not the person. The tenant pays about 30% of their income toward rent. In Orange County most PBV units are filled by referral through the Coordinated Entry System (dial 2-1-1); some buildings are set aside for seniors, veterans, or Regional Center clients.",
      sectionTitle: "Moving on: Choice Mobility (the Family Right to Move)",
      sectionIntro:
        "A federal HUD rule, not specific to Anaheim. Here is how a tenant transitions from a locked PBV unit (like Integrity Cottages) to a mobile, tenant-based voucher:",
      steps: [
        {
          title: "The 1-year milestone",
          sub: "Moving before 12 months forfeits assistance",
          body: "The tenant must live in their PBV unit in good standing for a minimum of 12 full months. During this first year the subsidy is strictly tied to the apartment; if they move out, they lose their rental assistance entirely.",
        },
        {
          title: "Submit a formal request",
          sub: "Initiated with the local housing authority",
          body: "Once the one-year mark is reached, the tenant officially requests a standard Housing Choice Voucher from the housing authority managing the property (AHA in this case).",
        },
        {
          title: "The priority waitlist",
          sub: "Issuance depends on turnover availability",
          body: "Housing authorities rarely have unused vouchers sitting around. The tenant is placed on a Choice Mobility priority waitlist and gets first dibs on the next turnover voucher that frees up when someone leaves the Section 8 program.",
        },
        {
          title: "The housing search",
          sub: "Usually a 60–120 day window",
          body: "Once the standard voucher is issued the clock starts. The tenant has a set timeframe to find a private landlord who accepts Section 8 and whose unit passes HUD's housing quality inspection.",
        },
        {
          title: "The final move",
          sub: "Original subsidy remains with the PBV property",
          body: "If a unit is secured, the tenant moves and their new tenant-based voucher pays the subsidy at the new location. The original PBV subsidy stays behind at Integrity Cottages and is awarded to the next eligible person on the building's waitlist.",
        },
      ],
      safetyNet:
        "If the tenant gets the voucher but their search window expires before they find a place, they do not become homeless. As long as they haven't submitted notice to vacate, they keep their current PBV unit.",
    },
  },
};

export function categoryInfo(category) {
  return CATEGORY_INFO[category] || null;
}
