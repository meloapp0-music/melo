// Ported verbatim from the base44 prototype (Stubs).
// Vintage ticket-stub texture: fine paper fibres + subtle ink-bleed mottle +
// a faint edge feather where the print would bleed past the cut. All three
// layers are multiply-blended so they only darken (ink absorbs, paper fibres
// catch light) — they never add colour of their own, and content rendered
// above them stays crisp. `inset` skips a border (e.g. the stub's white frame).

const FIBRE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23f)'/></svg>")`;

const INK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='i'><feTurbulence type='turbulence' baseFrequency='0.05 0.07' numOctaves='3' seed='4'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR tableValues='0 0.55'/><feFuncG tableValues='0 0.55'/><feFuncB tableValues='0 0.55'/></feComponentTransfer></filter><rect width='100%25' height='100%25' filter='url(%23i)'/></svg>")`;

export default function StubVintage({ inset = 0, fibreOpacity = 0.14, inkOpacity = 0.1, edge = true }) {
  const insetVal = typeof inset === 'number' ? `${inset}px` : inset;
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: insetVal, backgroundImage: FIBRE, backgroundSize: '120px 120px', mixBlendMode: 'multiply', opacity: fibreOpacity, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: insetVal, backgroundImage: INK, backgroundSize: '180px 180px', mixBlendMode: 'multiply', opacity: inkOpacity, pointerEvents: 'none' }} />
      {edge && (
        <div aria-hidden style={{ position: 'absolute', inset: insetVal, background: 'radial-gradient(120% 120% at 50% 50%, rgba(0,0,0,0) 60%, rgba(26,25,24,0.16) 100%)', mixBlendMode: 'multiply', pointerEvents: 'none' }} />
      )}
    </>
  );
}
