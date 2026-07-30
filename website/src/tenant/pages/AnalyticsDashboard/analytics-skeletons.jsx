import { CARD_CLS } from './analytics-shared';

const Pulse = ({ className = '' }) => (
  <div className={`animate-pulse bg-neutral-100 rounded-xl ${className}`} />
);

/* ─── Shared Primitives ────────────────────────── */
function StatCardSkeleton() {
  return (
    <div className={`${CARD_CLS} p-5`}>
      <div className="flex items-start justify-between mb-3">
        <Pulse className="w-12 h-12 rounded-2xl" />
        <Pulse className="w-16 h-5 rounded-full" />
      </div>
      <Pulse className="h-8 w-24 rounded-lg mb-2" />
      <Pulse className="h-3 w-32 rounded" />
    </div>
  );
}

function StatCardsRow({ count = 4 }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => <StatCardSkeleton key={i} />)}
    </div>
  );
}

function ChartSkeleton({ height = 'h-[280px]' }) {
  return (
    <div className={`${CARD_CLS} p-5`}>
      <div className="flex items-center gap-3 mb-5">
        <Pulse className="w-10 h-10 rounded-xl" />
        <div className="space-y-1.5">
          <Pulse className="h-4 w-32 rounded" />
          <Pulse className="h-3 w-24 rounded" />
        </div>
      </div>
      <Pulse className={`w-full rounded-xl ${height}`} />
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div className={`${CARD_CLS} p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <Pulse className="w-10 h-10 rounded-xl" />
        <Pulse className="h-4 w-32 rounded" />
      </div>
      <div className="flex justify-center mb-4">
        <Pulse className="w-[200px] h-[200px] rounded-full" />
      </div>
      <div className="space-y-2">
        {[1,2,3].map((i) => <Pulse key={i} className="h-4 w-full rounded" />)}
      </div>
    </div>
  );
}

/* ─── Panel Skeletons ──────────────────────────── */
export function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardsRow count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7"><ChartSkeleton /></div>
        <div className="lg:col-span-5"><DonutSkeleton /></div>
      </div>
      <StatCardsRow count={3} />
    </div>
  );
}

export function FinancialSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardsRow count={4} />
      <ChartSkeleton height="h-[320px]" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4"><DonutSkeleton /></div>
        <div className="lg:col-span-8"><ChartSkeleton height="h-[320px]" /></div>
      </div>
      <StatCardsRow count={5} />
      <ChartSkeleton height="h-[260px]" />
    </div>
  );
}

export function ClinicalSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardsRow count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7"><ChartSkeleton height="h-[320px]" /></div>
        <div className="lg:col-span-5"><ChartSkeleton height="h-[260px]" /></div>
      </div>
      <div className={`${CARD_CLS} p-6`}>
        <Pulse className="h-4 w-48 rounded mb-4" />
        <div className="flex gap-3 overflow-hidden mb-6">
          {[1,2,3,4,5].map((i) => <Pulse key={i} className="w-[200px] h-[160px] rounded-xl shrink-0" />)}
        </div>
        {Array.from({ length: 5 }).map((_, i) => <Pulse key={i} className="h-12 w-full rounded-lg mb-2" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton height="h-[260px]" />
        <ChartSkeleton height="h-[260px]" />
      </div>
    </div>
  );
}

export function PatientsSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardsRow count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8"><ChartSkeleton height="h-[320px]" /></div>
        <div className="lg:col-span-4">
          <div className={`${CARD_CLS} p-5 space-y-5`}>
            {[1,2,3].map((i) => (
              <div key={i}>
                <Pulse className="h-3 w-20 rounded mb-2" />
                <Pulse className="h-8 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <ChartSkeleton height="h-[300px]" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5"><DonutSkeleton /></div>
        <div className="lg:col-span-7">
          <div className={`${CARD_CLS} p-5 space-y-4`}>
            {[1,2,3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Pulse className="w-10 h-10 rounded-xl" />
                <Pulse className="h-6 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function IntegrationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className={`${CARD_CLS} px-6 py-4`}>
        <div className="flex items-center justify-between gap-6">
          {[1,2,3,4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Pulse className="w-10 h-10 rounded-xl" />
              <div className="space-y-1">
                <Pulse className="h-3 w-16 rounded" />
                <Pulse className="h-6 w-12 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1,2,3,4].map((i) => (
          <div key={i} className={`${CARD_CLS} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-3">
              <Pulse className="w-10 h-10 rounded-xl" />
              <Pulse className="h-5 w-32 rounded" />
            </div>
            <div className="p-6 space-y-4">
              {[1,2,3,4].map((j) => <Pulse key={j} className="h-4 w-full rounded" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
