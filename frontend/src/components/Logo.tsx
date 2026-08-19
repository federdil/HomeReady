/**
 * The HomeReady lockup.
 *
 * The mark is the same object the product puts on the map — a pin with a roof
 * inside it — so the brand and the interface are one idea rather than two. At
 * small sizes the roof drops out and it becomes a clean pin with a dot, which
 * is what the favicon uses.
 */

const BRAND = '#9C2F62'

export function LogoMark({ size = 28, colour = BRAND, voidColour = '#FFFFFF' }: {
  size?: number
  colour?: string
  /** The cut-out. Must match whatever sits behind the mark. */
  voidColour?: string
}) {
  const simplified = size < 22

  return (
    <svg
      width={size}
      height={size * 1.22}
      viewBox="0 0 36 44"
      role="img"
      aria-label="HomeReady"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path
        d="M18 2 C9.2 2 2 9.2 2 18 C2 29 18 42 18 42 C18 42 34 29 34 18 C34 9.2 26.8 2 18 2 Z"
        fill={colour}
      />
      {simplified
        ? <circle cx="18" cy="18" r="5.6" fill={voidColour} />
        : <path d="M11 22 L18 15.2 L25 22 L25 28.5 L11 28.5 Z" fill={voidColour} />}
    </svg>
  )
}

export function Logo({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span
        className="font-display text-ink leading-none"
        style={{ fontSize: size * 0.82, letterSpacing: '-0.02em' }}
      >
        HomeReady
      </span>
    </span>
  )
}
