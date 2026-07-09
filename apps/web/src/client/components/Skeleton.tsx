import type { ReactNode } from 'react';

/** A single shimmering placeholder block. Shape it with Tailwind classes. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">{children}</div>;
}

function repeat(n: number, render: (i: number) => ReactNode): ReactNode[] {
  return Array.from({ length: n }, (_, i) => render(i));
}

/** Grid of guild cards — mirrors GuildList's avatar + name rows. */
export function GuildListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {repeat(6, (i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Filter chips, stat tiles and chart cards — mirrors StatsTab. */
export function StatsSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">{repeat(3, (i) => <Skeleton key={i} className="h-10 w-20 rounded-xl" />)}</div>
      <div className="grid gap-4 sm:grid-cols-4">
        {repeat(4, (i) => (
          <Card key={i}>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>
      {repeat(2, (i) => (
        <Card key={i}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-[220px] w-full rounded-xl" />
        </Card>
      ))}
    </div>
  );
}

/** Form sections with field rows and a save button — mirrors Settings/Protection/Welcome. */
export function FormSkeleton({ sections = 1 }: { sections?: number }) {
  return (
    <div className="grid gap-8">
      {repeat(sections, (s) => (
        <Card key={s}>
          <Skeleton className="mb-4 h-5 w-40" />
          <div className="grid gap-3">
            {repeat(4, (i) => (
              <Skeleton key={i} className="h-4 w-full max-w-md" />
            ))}
            <Skeleton className="mt-1 h-24 w-full rounded-xl" />
          </div>
        </Card>
      ))}
      <Skeleton className="h-10 w-28 rounded-xl" />
    </div>
  );
}

/** Card with an avatar, a button and an input — mirrors BotProfileCard. */
export function CardSkeleton() {
  return (
    <Card>
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-full rounded-xl" />
    </Card>
  );
}

/** Two cards of list rows — mirrors VoiceLogTab. */
export function VoiceLogSkeleton() {
  return (
    <div className="grid gap-8">
      {repeat(2, (c) => (
        <Card key={c}>
          <Skeleton className="mb-4 h-5 w-40" />
          <div className="grid gap-3">
            {repeat(4, (i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ms-auto h-4 w-12" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
