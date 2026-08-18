// A labelled auth input. Tiny uppercase label, hairline underline, and the
// error sitting directly beneath the field it belongs to rather than in a
// single lump at the bottom of the form — with three password fields on
// screen, "Passwords don't match" needs to point at one of them.
//
// 16px is a hard floor, not a style choice: iOS Safari zooms the viewport on
// focus for anything smaller, and the zoom does not undo itself on blur.
export default function Field({
  label, type = 'text', value, onChange, onBlur, placeholder, error,
  prefix, hint, autoComplete, autoFocus, inputMode, maxLength, minLength,
  name, id, required, disabled,
}) {
  const fieldId = id || name || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="mb-5">
      {label && (
        <label
          htmlFor={fieldId}
          className="block font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground mb-2"
        >
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-1 border-b pb-2 transition-colors ${
          error ? 'border-foreground' : 'border-border focus-within:border-accent'
        }`}
      >
        {prefix && (
          <span className={`font-sans text-base ${value ? 'text-foreground' : 'text-muted-foreground/50'}`}>
            {prefix}
          </span>
        )}
        <input
          id={fieldId}
          name={name || fieldId}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          inputMode={inputMode}
          maxLength={maxLength}
          minLength={minLength}
          required={required}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent border-none outline-none font-sans text-base text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50"
        />
      </div>
      {/* --ember-text, not the accent: this is 11px, and #F93827 is 3.63:1 on
          paper where AA wants 4.5:1. */}
      {error && (
        <p className="mt-2 font-sans text-[11px] leading-snug" style={{ color: 'var(--ember-text)' }}>
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="mt-2 font-sans text-[11px] leading-snug text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
