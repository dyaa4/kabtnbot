import { Gem } from 'lucide-react';

/** Standard "this tab is premium" panel (same look as the log tabs' gate). */
export function PremiumUpsell({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/5 p-12 text-center backdrop-blur-md">
      <Gem className="h-10 w-10 text-blue-300" />
      <h3 className="text-lg font-semibold text-blue-200">{title}</h3>
      <p className="max-w-md text-sm text-slate-400">{body}</p>
    </div>
  );
}
