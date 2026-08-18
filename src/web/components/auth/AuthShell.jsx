// The frame every auth screen sits in.
// =====================================
// Auth is returned from App.jsx's render gates BEFORE the .app shell exists
// (see the `session.status === 'signedOut'` branch), so these screens ARE the
// root element. Two consequences the in-app screens don't have:
//
//   * 100vh is correct here. The in-app rule — `flex-1 min-h-0` inside a
//     100dvh column — would collapse to nothing without a flex parent.
//   * They don't inherit `.app`'s `max-width: 430px; margin: 0 auto`, so
//     without a column of their own they run edge to edge on iPad and desktop.
//
// The height is written twice on purpose. IPHONEOS_DEPLOYMENT_TARGET is 15.0
// and `dvh` shipped in Safari 15.4, so on 15.0–15.3 the second declaration is
// dropped as invalid and the first one carries. Inside a Capacitor WKWebView
// there is no browser chrome, so the two are the same number anyway.
//
// Safe areas are applied by hand because nothing else supplies them here —
// index.html already sets viewport-fit=cover, which is what makes them
// non-zero.

export default function AuthShell({ children, footer }) {
  return (
    <div
      className="w-full bg-background relative overflow-y-auto"
      style={{ minHeight: '100vh', minHeight: '100dvh' }}
    >
      {/* The same ember wash Home carries at its top edge. Without it auth is
          the only cold-bone screen in the app — the first one anyone sees. */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent/10 via-accent/5 to-transparent pointer-events-none" />

      <div
        className="mx-auto w-full max-w-[430px] px-8 relative flex flex-col"
        style={{
          minHeight: '100vh',
          minHeight: '100dvh',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
        }}
      >
        {children}
        {/* Pushed to the bottom of the sheet: the primary action sits in the
            lower third, within thumb reach. These screens are filled in
            one-handed, often standing up. */}
        {footer && <div className="mt-auto pt-6">{footer}</div>}
      </div>
    </div>
  );
}
