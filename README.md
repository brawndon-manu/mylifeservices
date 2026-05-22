# My Life Services

The website for My Life Services — a provider of person-centered support programs for adults with intellectual and developmental disabilities. We partner with individuals, families, and Regional Center consumers across Independent Living, Day Program, Supported Living, Self-Determination, and Crisis Support.

I'm an Independent Living instructor at MLS and also handle IT — this site is something I built and maintain in-house.

Live site: deployed on Vercel.
Phone: (909) 837-0907
Email: support@mylifeservices.net

## Pages

- `/` — home
- `/about`
- `/services` and `/services/[slug]` — overview and per-service detail pages
- `/careers`, `/careers/[slug]`, `/careers/apply` — open roles and the application form
- `/contact`

The careers application form submits through EmailJS (`@emailjs/browser`).

## Stack

- Next.js 16 (App Router) with React 19
- Tailwind CSS 4
- Deployed on Vercel

## Local development

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm start` — run the production build
- `npm run lint` — ESLint
