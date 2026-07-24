// The public site presents a single service right now: Independent Living
// Services (ILS). The other supports we offer show up under the ILS umbrella
// (see `umbrella` on the ILS object below) instead of as their own services, and
// the Day Program is intentionally off the public site for now. The full original
// content for every service lives in archive/services/services-original.js.
export const services = [
  {
    slug: "independent-living",
    name: "Independent Living Services (ILS)",
    short: "Skills and support for adults building greater independence.",
    description:
      "Independent Living Services (ILS) provide structured, one-on-one support for adults with intellectual and developmental disabilities who want to build greater independence in their daily lives. Services are tailored to each participant’s goals and focus on developing practical skills within real-world environments.",
    categoriesIntro: {
      title: "What Independent Living Services Include",
    },
    // the ILS page tells the story as a day first, then opens the full skills
    // browser underneath. every `skills` label below is pulled from the real
    // categories further down, so the narrative never promises something we
    // don't actually work on.
    day: [
      {
        when: "Morning",
        title: "The day starts on your own terms",
        body: "Routines that hold together without someone standing over them: getting ready, keeping medication straight, putting a real breakfast on the table, and knowing what the day looks like before it starts. We build the system with you, then step back out of it.",
        skills: [
          "Hygiene routines",
          "Medication organization",
          "Meal planning and cooking",
          "Health routines and checklists",
        ],
      },
      {
        when: "Out the door",
        title: "Getting there yourself",
        body: "We ride the bus with you until the route is yours, not ours. Reading a schedule, planning the trip, paying the fare, crossing a busy street, and having a backup when the bus never shows.",
        skills: [
          "Public transit until routes are mastered",
          "Reading schedules and maps",
          "Trip planning and transit passes",
          "Emergency backup plans",
        ],
      },
      {
        when: "Daytime",
        title: "Work, school, or figuring out what's next",
        body: "Whatever the goal is, we work backward from it. We get you to the employment services that handle resumes and job placement, then practice the interview, what to expect once you're hired, what accommodations you can ask for, and how to speak up when something isn't working.",
        skills: [
          "Employment service referrals",
          "Interview practice",
          "Workplace accommodations",
          "Self-advocacy at work and school",
          "Identifying strengths and interests",
        ],
      },
      {
        when: "Errands",
        title: "Money decisions you make yourself",
        body: "A grocery list that survives contact with a real budget. Bills that get paid before they're late. Benefits kept current. Knowing a scam when it calls you. Savings that grow because you decided they would.",
        skills: [
          "Budgeting with visual tools",
          "Banking and bill payment",
          "Recognizing scams",
          "Savings goals with tracking",
        ],
      },
      {
        when: "Evening",
        title: "A place that's actually yours",
        body: "The ordinary work of keeping a home: cooking, laundry, cleaning that stays done. And the harder parts nobody warns you about, like talking to a roommate, calling a landlord, and understanding what the lease you signed actually says.",
        skills: [
          "Cleaning and laundry routines",
          "Roommate communication",
          "Communicating with landlords",
          "Lease agreements and tenant rights",
        ],
      },
      {
        when: "Any time",
        title: "The things nobody plans for",
        body: "Independence includes the bad days. Knowing what to do, who to call, and what you're entitled to, before you need any of it.",
        skills: [
          "Emergency procedures and calling 911",
          "Personalized safety plans",
          "Disability rights and legal protections",
          "ADA, Fair Housing, and Lanterman Act",
        ],
      },
    ],
    categories: [
      {
        name: "Personal Care & Health",
        items: [
          "Establishing consistent hygiene routines",
          "Developing meal planning and cooking skills",
          "Medication organization and reminder systems",
          "Attending and preparing for medical appointments",
          "Practicing communication with healthcare providers",
          "Maintaining regular health routines and checklists",
          "Learning basic nutrition and healthy lifestyle habits",
        ],
      },
      {
        name: "Home & Daily Living",
        items: [
          "Establishing structured cleaning routines",
          "Developing laundry skills, including sorting and folding",
          "Grocery shopping with budgeting and list planning",
          "Safe and appropriate use of household appliances",
          "Practicing home safety awareness and routines",
          "Organizing household items using visual supports",
          "Learning proper cleaning techniques for independent living",
          "Creating and maintaining emergency contact information",
        ],
      },
      {
        name: "Money Management",
        items: [
          "Developing simple budgeting skills using visual tools",
          "Learning basic banking routines and financial literacy",
          "Understanding bill payment processes and account alerts",
          "Practicing financial decision-making and problem-solving",
          "Recognizing financial scams and predatory practices",
          "Organizing benefit documentation and renewal timelines",
          "Using tools or apps to support financial organization",
          "Building savings goals with structured tracking systems",
        ],
      },
      {
        name: "Housing & Tenancy Skills",
        items: [
          "Searching for and evaluating housing options",
          "Reviewing lease agreements and understanding tenant responsibilities",
          "Setting up utilities and essential services",
          "Developing roommate communication strategies",
          "Practicing effective communication with landlords",
          "Completing housing and subsidy applications",
          "Establishing systems for timely rent payment",
          "Accessing affordable housing resources and waitlists",
          "Developing basic home maintenance routines",
        ],
      },
      {
        name: "Transportation & Mobility",
        items: [
          "Accompanying individuals on public transportation until routes are mastered",
          "Learning how to read transportation schedules and maps",
          "Practicing trip planning and purchasing transit passes",
          "Using navigation apps and transit tracking tools",
          "Developing appropriate communication skills for public transit settings",
          "Building safety awareness for various transportation scenarios",
          "Completing applications for reduced fare or paratransit services",
          "Practicing safe street crossing and navigating busy areas",
          "Developing emergency transportation backup plans",
        ],
      },
      {
        name: "Employment & Education",
        items: [
          "Finding resume and job-search help through employment services",
          "Practicing job interview and workplace communication scenarios",
          "Exploring workplace accommodation options and disclosure strategies",
          "Connecting with vocational rehabilitation and employment services",
          "Understanding appropriate workplace expectations and professional behavior",
          "Enrolling in educational or training programs",
          "Building study skills and time management strategies",
          "Practicing self-advocacy in employment and educational settings",
          "Developing plans to address workplace challenges",
          "Identifying personal strengths and career interests",
        ],
      },
      {
        name: "Communication & Social Skills",
        items: [
          "Developing effective phone and digital communication skills",
          "Practicing appropriate responses in social situations",
          "Building conflict resolution and problem-solving skills",
          "Preparing for difficult conversations using structured approaches",
          "Participating in social opportunities in supportive environments",
          "Learning appropriate boundaries and relationship skills",
          "Understanding and interpreting social cues",
          "Practicing self-advocacy in various settings",
          "Engaging in social groups based on personal interests",
          "Developing strategies for navigating uncomfortable social situations",
        ],
      },
      {
        name: "Community Participation",
        items: [
          "Exploring and accessing community resources",
          "Obtaining library cards and learning how to access local resources",
          "Understanding civic engagement opportunities, including voting registration",
          "Using community recreation facilities safely and independently",
          "Connecting with interest-based groups and clubs",
          "Participating in cultural and community activities",
          "Attending community events based on individual interests",
          "Developing community-based problem-solving skills",
          "Learning about local disability advocacy organizations",
          "Exploring volunteer opportunities aligned with personal interests",
        ],
      },
      {
        name: "Parenting & Family Responsibilities",
        items: [
          "Connecting with parenting resources and support groups",
          "Developing child care routines and structured schedules",
          "Learning child safety procedures and emergency responses",
          "Organizing home systems that support parenting responsibilities",
          "Understanding age-appropriate activities and developmental milestones",
          "Accessing parenting classes and educational resources",
          "Balancing parenting responsibilities and self-care",
          "Managing children’s appointments and schedules",
          "Building nurturing and healthy parent-child relationships",
          "Connecting with family support services as needed",
        ],
      },
      {
        name: "Emergency & Safety Skills",
        items: [
          "Developing clear emergency procedures for various scenarios",
          "Practicing emergency communication, including contacting 911",
          "Creating personalized safety plans with key contact information",
          "Learning how to use safety equipment appropriately",
          "Building appropriate responses to emergency situations",
          "Preparing emergency preparedness kits",
          "Learning basic first aid awareness and safety skills",
          "Identifying potentially unsafe situations",
          "Understanding fire evacuation procedures and meeting locations",
          "Setting up emergency contact information in accessible locations",
        ],
      },
      {
        name: "Legal & Support",
        items: [
          "Understanding disability rights and legal protections",
          "Reviewing legal documents in clear and accessible language",
          "Connecting with disability rights organizations and legal aid resources",
          "Practicing self-advocacy in legal and administrative settings",
          "Attending legal appointments for support when appropriate",
          "Organizing and maintaining important legal documentation",
          "Developing strategies for addressing legal challenges",
          "Understanding rights under the ADA and Fair Housing Act",
          "Understanding Lanterman Act services and entitlements",
          "Learning legal rights and responsibilities in accessible formats",
        ],
      },
    ],
    cta: {
      title: "Is Independent Living Services right for you?",
      body: "Our team works closely with individuals and families to identify the skills and supports that will help each participant build the independence they’re looking for. We’re happy to talk through goals, answer questions, and explain how to get started.",
      buttonLabel: "Contact us about Independent Living",
      buttonHref: "/contact",
    },
    // extra supports we offer as part of ILS, shown under the ILS umbrella rather
    // than as their own services. the Day Program is intentionally left off the
    // public site for now. full original content for all of these lives in
    // archive/services/services-original.js.
    umbrella: {
      title: "Supports available through ILS",
      intro:
        "Independent Living Services flexes to meet each person where they are. Depending on someone's goals and needs, ILS support can also include:",
      items: [
        {
          name: "Supported Living",
          description:
            "Hands-on, in-home support across daily routines, health and medication, household management, and community life, with respect for each person's preferences and independence.",
        },
        {
          name: "Self-Determination",
          description:
            "Guidance for people who choose to direct their own services and budgets: person-centered planning, coordinating supports, and help navigating options with confidence.",
        },
        {
          name: "Crisis Support",
          description:
            "Timely, short-term help during periods of heightened stress or unexpected disruption, focused on stabilization, safety planning, and connecting people with the right next steps.",
        },
      ],
    },
    roleDescription:
      "Support individuals in building independence through goal-based coaching and daily living skill development.",
    role: {
      title: "Independent Living Services (ILS)",
      intro: [
        "Independent Living Services (ILS) staff provide one-on-one support to adults with intellectual and developmental disabilities in building the skills needed for greater independence.",
        "This role focuses on real-world skill development, community engagement, and supporting individuals in achieving their personal goals in daily life.",
      ],
      whatYoullDo:
        "Working in ILS involves providing individualized support in a variety of real-life settings. Staff help participants develop practical skills while encouraging independence, confidence, and meaningful community involvement.",
      responsibilities: [
        "Support individuals with daily living skills such as cooking, cleaning, and personal organization",
        "Assist with budgeting, shopping, and money management",
        "Provide guidance with scheduling, appointments, and time management",
        "Support community integration, including outings and social activities",
        "Assist with transportation training and navigation",
        "Encourage communication, decision-making, and problem-solving skills",
        "Document progress and communicate with the support team as needed",
      ],
      dayToDay: [
        "Working one-on-one with participants in their home and community",
        "Following individualized support plans",
        "Adapting support based on each person's goals and needs",
        "Building consistent, supportive relationships",
        "Promoting independence while providing appropriate guidance",
      ],
      whyWork: {
        heading: "Why Work in ILS",
        body: "Working in Independent Living Services offers the opportunity to make a meaningful, direct impact in someone's daily life. Staff build strong, supportive relationships while helping individuals grow their independence and confidence over time. This role is ideal for those who value one-on-one support, flexibility, and seeing real progress in the people they work with.",
      },
    },
  },
];
