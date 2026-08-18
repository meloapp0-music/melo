// Ported verbatim from the base44 prototype (Stubs, src/components/melo/
// SectionLabel.jsx). Inline styles rather than utilities on purpose: the
// prototype is the source of truth for this design, and translating it into
// Tailwind is where the drift came from — every re-interpretation lost a few
// pixels of tracking or a weight, and those add up to a different screen.
export default function SectionLabel({ children, color = '#78716C', as: Tag = 'div', style, ...rest }) {
  return (
    <Tag
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        letterSpacing: '0.4em',
        color,
        textTransform: 'uppercase',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
