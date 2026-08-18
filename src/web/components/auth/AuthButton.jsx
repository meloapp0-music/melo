// The auth primary action, and the quiet link under it.
//
// BLACK ON EMBER, NOT WHITE. Measured: white on #F93827 is 3.73:1 and this
// label is 11px, where AA wants 4.5:1. Black #1A1918 on the same ground is
// 4.70:1. The Sleek specimen says `text-white` and is wrong; base44 arrived at
// black independently.
//
// Disabled is NOT a faded ghost. An `opacity-20` button is unreadable and
// gives the user nothing to aim at while they work out what's missing — it
// becomes the secondary treatment instead: outlined, muted, legible, inert.
export function AuthButton({ children, onClick, disabled, busy, type = 'button' }) {
  const dead = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={dead}
      className={`w-full py-4 font-sans font-black uppercase tracking-[0.3em] text-[11px] transition-transform ${
        dead
          ? 'bg-transparent border border-border text-muted-foreground cursor-not-allowed'
          : 'bg-accent text-foreground active:scale-[0.98]'
      }`}
    >
      {children}
    </button>
  );
}

// "Already have an account? Sign in" — the switch between the two auth
// screens. It has to be findable without competing with the primary action,
// so: full contrast on the verb, muted on the sentence around it.
export function AuthLink({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full mt-4 py-3 font-sans text-[12px] text-muted-foreground active:scale-[0.98] transition-transform disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export const Emphasis = ({ children }) => (
  <span className="text-foreground underline underline-offset-2">{children}</span>
);
