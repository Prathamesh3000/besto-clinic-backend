/* Skeleton loaders for each Dashboard section */

const Pulse = ({ className }) => (
  <div className={`animate-pulse bg-neutral-100 rounded-xl ${className}`} />
);

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)]">
          <div className="animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-neutral-100 rounded-2xl" />
              <div className="w-16 h-5 bg-neutral-100 rounded-full" />
            </div>
            <div className="h-8 bg-neutral-100 rounded-lg w-24 mb-2" />
            <div className="h-3 bg-neutral-100 rounded w-32 mb-3" />
            <div className="h-10 bg-neutral-50 rounded-lg w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 'h-[340px]' }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
            <div>
              <div className="h-4 bg-neutral-100 rounded w-32 mb-1.5" />
              <div className="h-3 bg-neutral-100 rounded w-24" />
            </div>
          </div>
          <div className="flex gap-1">
            <div className="w-16 h-7 bg-neutral-100 rounded-lg" />
            <div className="w-16 h-7 bg-neutral-100 rounded-lg" />
            <div className="w-16 h-7 bg-neutral-100 rounded-lg" />
          </div>
        </div>
        <Pulse className={`${height} w-full`} />
      </div>
    </div>
  );
}

export function DonutSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
          <div>
            <div className="h-4 bg-neutral-100 rounded w-40 mb-1.5" />
            <div className="h-3 bg-neutral-100 rounded w-24" />
          </div>
        </div>
        <div className="flex justify-center mb-4">
          <div className="w-[200px] h-[200px] bg-neutral-100 rounded-full" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-neutral-100 rounded-full" />
              <div className="h-3 bg-neutral-100 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
            <div>
              <div className="h-4 bg-neutral-100 rounded w-36 mb-1.5" />
              <div className="h-3 bg-neutral-100 rounded w-28" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-14 h-4 bg-neutral-100 rounded" />
              <div className="w-2.5 h-2.5 bg-neutral-100 rounded-full shrink-0" />
              <div className="flex-1 h-4 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QueueSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
          <div>
            <div className="h-4 bg-neutral-100 rounded w-28 mb-1.5" />
            <div className="h-3 bg-neutral-100 rounded w-20" />
          </div>
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
              <div className="w-8 h-8 bg-neutral-100 rounded-full shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 bg-neutral-100 rounded w-32 mb-1" />
                <div className="h-3 bg-neutral-100 rounded w-24" />
              </div>
              <div className="w-16 h-5 bg-neutral-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DoctorsSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
            <div>
              <div className="h-4 bg-neutral-100 rounded w-40 mb-1.5" />
              <div className="h-3 bg-neutral-100 rounded w-24" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[200px] p-4 bg-neutral-50 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-neutral-100 rounded-full" />
                <div>
                  <div className="h-3.5 bg-neutral-100 rounded w-24 mb-1" />
                  <div className="h-3 bg-neutral-100 rounded w-20" />
                </div>
              </div>
              <div className="h-3 bg-neutral-100 rounded w-full mb-2" />
              <div className="h-2 bg-neutral-100 rounded-full w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AlertsSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
          <div>
            <div className="h-4 bg-neutral-100 rounded w-48 mb-1.5" />
            <div className="h-3 bg-neutral-100 rounded w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 bg-neutral-50 rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
