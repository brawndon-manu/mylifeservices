import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import ApplyForm from "./ApplyForm";

export const metadata = {
  title: "Apply",
  description:
    "Apply for a position at My Life Services. Submit your employment application online.",
};

export default function ApplyPage() {
  return (
    <>
      <PageHeader
        backHref="/careers"
        backLabel="All careers"
        title="Employment application"
        intro="Tell us about your background and how you’d like to support adults with intellectual and developmental disabilities at My Life Services. The form takes about 10–15 minutes to complete."
      />
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <Suspense fallback={<p className="text-slate-600">Loading form…</p>}>
            <ApplyForm />
          </Suspense>
        </div>
      </section>
    </>
  );
}
