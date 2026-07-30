import { FadeIn } from './Motion';

export default function SectionHeading({ label, title, description, centered = true }) {
  return (
    <FadeIn className={`max-w-3xl ${centered ? 'mx-auto text-center' : ''} mb-16`}>
      {label && (
        <span className="inline-block px-4 py-1.5 bg-primary-50/80 text-primary-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-primary-200/40">
          {label}
        </span>
      )}
      <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 font-display mb-4 leading-tight">
        {title}
      </h2>
      {description && (
        <p className="text-lg text-neutral-900/60 leading-relaxed">{description}</p>
      )}
    </FadeIn>
  );
}
