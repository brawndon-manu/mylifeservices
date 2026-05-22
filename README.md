# MLS Website

The marketing site for My Life Services, built with Next.js 16, React 19, and Tailwind CSS 4. Deployed on Vercel.

## Pages

- `/` — home
- `/about`
- `/services` and `/services/[slug]` — service detail pages
- `/careers`, `/careers/[slug]`, `/careers/apply` — role listings and application form
- `/contact`

The apply form is wired up through EmailJS (`@emailjs/browser`).

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
