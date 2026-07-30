import { Search } from 'lucide-react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export default function GlobalSearchTrigger({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200/80 text-neutral-500 transition group cursor-pointer"
      aria-label="Open search"
    >
      <Search className="h-4 w-4 text-neutral-400 group-hover:text-neutral-500 transition" />
      <span className="hidden md:inline text-sm text-neutral-400 group-hover:text-neutral-500 transition">
        Search...
      </span>
      <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 bg-white rounded border border-neutral-200 leading-none">
        {isMac ? '⌘' : 'Ctrl'}K
      </kbd>
    </button>
  );
}
