export const metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Almost in
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Check your email
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        If an account is associated with that email, you&apos;ll receive a
        sign-in link shortly. The link is good for the next 24 hours.
      </p>
      <p className="mt-6 text-sm text-muted">
        Don&apos;t see anything? Check your spam folder, double-check the
        address you entered, or contact IT if you believe you should have
        access.
      </p>
      <p className="mt-4 text-sm">
        <a
          href="/login"
          className="font-medium text-brand-light underline underline-offset-2 hover:text-brand"
        >
          Try a different email
        </a>
      </p>
    </section>
  );
}
