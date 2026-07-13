export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-10 text-center">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-400/90">{eyebrow}</p>
      <h2 className="text-3xl font-extrabold md:text-4xl">{title}</h2>
    </div>
  );
}
