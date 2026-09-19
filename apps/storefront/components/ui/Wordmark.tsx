export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 2.75v18.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 2.75a9.25 9.25 0 0 1 0 18.5Z" fill="currentColor" />
      </svg>
      <span className="text-[1.3125rem] font-semibold leading-none tracking-[-0.045em]">Meridian</span>
    </span>
  );
}
