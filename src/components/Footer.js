export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {year} My Life Services. All rights reserved.</p>
        <ul className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
          <li>
            <a
              href="tel:+19098370907"
              className="underline underline-offset-2 hover:text-slate-900"
            >
              (909) 837-0907
            </a>
          </li>
          <li>
            <a
              href="mailto:office.mylifeservices@gmail.com"
              className="underline underline-offset-2 hover:text-slate-900"
            >
              office.mylifeservices@gmail.com
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
