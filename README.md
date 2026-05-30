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

## Setting it up on a fresh machine (Mac or PC)

I work on this from two machines so this is the routine for getting it running from scratch.

```bash
git clone https://github.com/brawndon-manu/mylifeservices.git
cd mylifeservices
npm ci
```

I use `npm ci` instead of `npm install` on a fresh clone — it installs exactly what `package-lock.json` says without touching the lockfile. That way the lockfile doesn't drift between machines. I only use `npm install <pkg>` when I'm actually adding a new dependency.

### Stuff that isn't in the repo

A few things are gitignored (secrets + personal docs) and don't come with the clone:

- `.env.local` — credentials (DB URL, auth secret, Resend key, Vercel Blob token, etc.)
- `TASKS.md` and `leftoff.md` — my running task list + handoff notes between sessions
- `prisma/staff-emails.txt` and a couple one-off scripts in `prisma/` — they reference employee data
- `public/clients/` — client photos (only there once written consent is on file)

When I switch machines I bundle them up on the Mac like this and drop the archive in Google Drive:

```bash
tar -czf ~/Desktop/mls-private.tgz \
  .env.local \
  TASKS.md \
  leftoff.md \
  prisma/staff-emails.txt \
  prisma/update-names-add-david.js \
  prisma/update-from-hr-csv.js \
  public/clients/
```

On the other machine, after `git clone`, I drop the archive into the repo root and extract it:

```bash
tar -xzf mls-private.tgz
rm mls-private.tgz
```

If I don't have the archive but I do have the Vercel CLI linked, I can also pull just the env vars straight from Vercel:

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
```

That gives me everything in `.env.local` without needing the archive — but I still have to bring `TASKS.md` / `leftoff.md` / the scripts manually since they aren't in Vercel.

### Then start it

```bash
npm run dev
```

Open <http://localhost:3000>.
