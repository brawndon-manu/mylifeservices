export const metadata = {
  title: "Sign-in error",
  robots: { index: false, follow: false },
};

export default async function LoginErrorPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;

  // Intentionally generic: don't reveal whether the email exists, whether
  // the link expired, or whether the user lacks access.
  const message =
    "Something went wrong signing you in. Try again, or contact IT if the problem continues.";

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-rose-600">
        Sign-in error
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        We couldn&apos;t sign you in
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        {message}
      </p>
      <a
        href="/login"
        className="mt-8 inline-flex justify-center rounded-md bg-brand-light px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Try again
      </a>
    </section>
  );
}
