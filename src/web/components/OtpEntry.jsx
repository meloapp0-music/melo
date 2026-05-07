import { useState, useEffect, useRef } from 'react';
import { verifyEmailOtp, resendSignupOtp } from '../lib/auth';
import { MeloLockup } from './MeloLogo';

// Single-digit input boxes for an email OTP code.
// - Auto-advances on type, jumps back on Backspace
// - Paste-to-fill from any-length digit string (Cmd+V works after
//   copying the code out of the email; non-digits are stripped)
// - `autoComplete="one-time-code"` + `inputMode="numeric"` enable
//   the iOS keyboard's auto-fill suggestion (iOS 17+ surfaces the
//   code when the email subject contains "code")
// - Resend has a 60-second cooldown (Supabase rate-limits anyway,
//   but the local cooldown keeps the UI honest)
//
// LENGTH NOTE: Supabase's signup-confirmation `{{ .Token }}` is
// actually 8 digits (their docs say 6 but the actual default is 8).
// Configurable via the `length` prop in case it changes again.
//
// Props:
//   email          — the address that should receive the code
//   length         — number of OTP digits expected (default 8)
//   onVerified()   — called when verifyOtp succeeds; parent should
//                    flip back to its loading state and let
//                    onAuthStateChange in App.jsx take it from there
//   onChangeEmail()— optional escape hatch ("use a different email")
export default function OtpEntry({ email, length = 8, onVerified, onChangeEmail }) {
  const [digits, setDigits] = useState(() => Array(length).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendOk, setResendOk] = useState(false);
  const inputRefs = useRef([]);

  // Cooldown tick. Starts at 60s on mount, counts down; "Resend code"
  // is only enabled when it hits 0.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Focus the first box on mount.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (i, raw) => {
    // Strip any non-digit (paste might include spaces, hyphens).
    const v = raw.replace(/\D/g, '');
    if (!v) {
      // User cleared a box — let them.
      const next = [...digits];
      next[i] = '';
      setDigits(next);
      return;
    }

    // If they typed/pasted multiple chars at once, fan them out.
    const next = [...digits];
    for (let k = 0; k < v.length && i + k < length; k++) {
      next[i + k] = v[k];
    }
    setDigits(next);

    // Advance focus to the next empty box (or stay on last if filled).
    const lastIdx = length - 1;
    const lastFilled = Math.min(i + v.length, lastIdx);
    inputRefs.current[lastFilled]?.focus();

    // If we now have every box filled, auto-submit so the user doesn't
    // have to hunt for the button.
    if (next.every((d) => d !== '')) {
      submit(next.join(''));
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      // Backspace on empty box → jump back and clear the previous.
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
      inputRefs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      inputRefs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && i < length - 1) {
      e.preventDefault();
      inputRefs.current[i + 1]?.focus();
    }
  };

  const submit = async (overrideToken) => {
    const token = overrideToken || digits.join('');
    if (token.length !== length) {
      setError(`Enter all ${length} digits`);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await verifyEmailOtp({ email, token });
      // onAuthStateChange in App.jsx fires; parent can also react.
      onVerified?.();
    } catch (err) {
      setError(err.message || 'That code didn\'t match — try again');
      setDigits(Array(length).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setResendOk(false);
    setResendBusy(true);
    try {
      await resendSignupOtp(email);
      setResendOk(true);
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || 'Couldn\'t resend — try again in a minute');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-brand">
        <MeloLockup iconSize={56} wordmarkSize={40} tagline />
      </div>

      <div className="auth-form">
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-sub">
          We sent a {length}-digit code to <b>{email}</b>. Enter it below to
          finish signing up.
        </p>

        <div className="otp-row">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              className="otp-box"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={busy}
            />
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}
        {resendOk && <div className="auth-ok">Sent — check your inbox.</div>}

        <button
          className="settings-save-btn"
          onClick={() => submit()}
          disabled={busy || digits.some((d) => d === '')}
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>

        <div className="auth-footer">
          <button
            type="button"
            className="auth-link"
            onClick={resend}
            disabled={resendBusy || resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `Resend code in ${resendCooldown}s`
              : resendBusy
                ? 'Sending…'
                : 'Resend code'}
          </button>
          {onChangeEmail && (
            <button type="button" className="auth-link" onClick={onChangeEmail}>
              Use a different email
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
