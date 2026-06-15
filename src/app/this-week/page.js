import Image from "next/image";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { categoryLabel, categoryChip, formatDate } from "@/lib/newsletter";

export const metadata = {
  title: "This Week",
  description:
    "Highlights and what's coming up at My Life Services: moments from our community, shared with permission.",
};

// always render fresh so a newly-published item shows up immediately.
export const dynamic = "force-dynamic";

export default async function ThisWeekPage() {
  const items = await prisma.newsletterItem.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }],
    take: 60,
  });

  return (
    <>
      <PageHeader
        eyebrow="This Week in My Life Services"
        title="Moments from our community"
        intro="Highlights from the people we support and the team behind them, plus a look at what's coming up. Shared with permission."
      />

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-base text-slate-600">
                Nothing posted yet. Check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-6 sm:grid-cols-12 sm:gap-8"
                >
                  {item.imageUrl && (
                    <div className="sm:col-span-5">
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <Image
                          src={item.imageUrl}
                          alt=""
                          width={1200}
                          height={900}
                          unoptimized
                          className="h-auto w-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  <div
                    className={item.imageUrl ? "sm:col-span-7" : "sm:col-span-12"}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryChip(item.category)}`}
                      >
                        {categoryLabel(item.category)}
                      </span>
                      {item.eventDate && (
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {formatDate(item.eventDate)}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                      {item.title}
                    </h2>
                    <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                      {item.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
