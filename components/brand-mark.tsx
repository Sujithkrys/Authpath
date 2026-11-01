/**
 * The Authpath mark: a white shield with a check on a blue tile. The tile is the
 * same in light and dark mode, so it reads on both, like the logos in the library.
 * app/icon.svg is the same drawing, used as the favicon.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="flex-none">
      <defs>
        <linearGradient id="authpath-mark" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4c5bff" />
          <stop offset="1" stopColor="#0007cd" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#authpath-mark)" />
      <path d="M16 6.2 24 9.1v6.4c0 4.7-3.3 8.3-8 10.3-4.7-2-8-5.6-8-10.3V9.1z" fill="#fff" />
      <path
        d="m11.9 15.6 2.9 2.9 5.4-5.8"
        fill="none"
        stroke="#0007cd"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
