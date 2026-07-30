const P = ({ className }) => <div className={`animate-pulse bg-neutral-100 rounded-lg ${className}`} />;

export function PresenceSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <P className="h-4 w-28 mb-1.5" />
          <P className="h-3 w-40" />
        </div>
        <P className="h-8 w-8 rounded-lg" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="px-6 py-4 border-b border-neutral-100 flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 bg-neutral-100 rounded-full shrink-0" />
          <div className="flex-1">
            <P className="h-3.5 w-28 mb-1" />
            <P className="h-3 w-20" />
          </div>
          <P className="h-4 w-16" />
          <P className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function WaitingSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <P className="h-4 w-24 mb-1.5" />
          <P className="h-3 w-36" />
        </div>
        <P className="h-8 w-8 rounded-lg" />
      </div>
      <div className="px-6 py-3 bg-neutral-50 border-b border-neutral-200 flex gap-6 animate-pulse">
        {[0, 1, 2, 3, 4, 5].map((i) => <P key={i} className="h-3 w-16" />)}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-6 py-3.5 border-b border-neutral-100 flex items-center gap-4 animate-pulse">
          <P className="h-3 w-6" />
          <P className="h-3.5 w-28" />
          <P className="h-3 w-24 hidden sm:block" />
          <P className="h-3 w-20 hidden md:block" />
          <P className="h-4 w-12" />
          <div className="ml-auto text-right">
            <P className="h-4 w-10 mb-1" />
            <P className="h-2.5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CapacitySkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <P className="h-4 w-28 mb-1.5" />
          <P className="h-3 w-36" />
        </div>
        <P className="h-8 w-8 rounded-lg" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="px-6 py-5 border-b border-neutral-100 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-neutral-100 rounded-xl" />
              <div>
                <P className="h-3.5 w-28 mb-1" />
                <P className="h-2.5 w-16" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <P className="h-5 w-10" />
              <P className="h-1.5 w-20 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6">
            {[0, 1, 2, 3].map((j) => (
              <div key={j}>
                <P className="h-2.5 w-14 mb-1.5" />
                <P className="h-4 w-12 mb-1" />
                <P className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RoomsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 overflow-hidden animate-pulse">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <P className="h-3.5 w-20 mb-1" />
              <P className="h-2.5 w-12" />
            </div>
            <P className="h-4 w-16" />
          </div>
          <div className="px-4 pb-4">
            <P className="h-10 w-full mb-3" />
            <div className="pt-3 border-t border-neutral-100 flex items-center gap-2">
              <P className="h-3 w-3" />
              <P className="h-2.5 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <P className="h-4 w-24 mb-1.5" />
          <P className="h-3 w-32" />
        </div>
        <P className="h-8 w-8 rounded-lg" />
      </div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="px-6 py-3.5 flex items-start gap-3.5 border-b border-neutral-100 last:border-b-0 animate-pulse">
          <div className="w-7 h-7 bg-neutral-100 rounded-lg shrink-0" />
          <div className="flex-1">
            <P className="h-3.5 w-3/4 mb-1" />
            <P className="h-2.5 w-20" />
          </div>
          <P className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SummaryBarSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] px-6 py-4">
      <div className="flex items-center justify-between gap-6 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-[18px] h-[18px] bg-neutral-100 rounded" />
            <div>
              <P className="h-4 w-8 mb-1" />
              <P className="h-2.5 w-16" />
            </div>
          </div>
        ))}
        <div className="min-w-[100px]">
          <P className="h-2.5 w-full mb-1.5" />
          <P className="h-1.5 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
