export default function Logo({ size = 34, text = true }) {
  return (<span className="logo">
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M9 13V9h4M23 13V9h-4M9 19v4h4M23 19v4h-4" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12.5 16.5l2.5 2.5 4.5-5" stroke="var(--accent-ink)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
    {text && <span className="logo-t"><b>Attendance</b><small>Institutional portal</small></span>}</span>);
}
