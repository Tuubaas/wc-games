export function PageLoading() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[--color-border] pb-6">
        <div className="w-full max-w-xl">
          <div className="h-3 w-24 animate-pulse rounded bg-[--color-accent-soft]" />
          <div className="mt-4 h-9 w-64 animate-pulse rounded bg-[--color-surface-2]" />
          <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-[--color-surface-2]" />
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-28 animate-pulse rounded-xl border border-[--color-border] bg-[--color-surface]/70"
          />
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="h-72 animate-pulse rounded-xl border border-[--color-border] bg-[--color-surface]/70" />
          <div className="h-52 animate-pulse rounded-xl border border-[--color-border] bg-[--color-surface]/70" />
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-[--color-border] bg-[--color-surface]/70" />
      </div>
    </main>
  );
}
