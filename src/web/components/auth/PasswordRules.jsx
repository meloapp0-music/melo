import Icon from '../Icon';

// Live password requirements. Shown as a checklist that fills in as you type,
// rather than as an error after you submit — the user should never be told
// what the rule was only once they've broken it.
const RULES = [
  { key: 'len', test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { key: 'letter', test: (p) => /[a-zA-Z]/.test(p), label: 'One letter' },
  { key: 'number', test: (p) => /[0-9]/.test(p), label: 'One number' },
];

export function passwordValid(p) {
  return RULES.every((r) => r.test(p || ''));
}

export default function PasswordRules({ value }) {
  return (
    <ul className="list-none p-0 -mt-2 mb-5">
      {RULES.map((r) => {
        const met = r.test(value || '');
        return (
          <li
            key={r.key}
            className={`flex items-center gap-2.5 py-0.5 font-sans text-[11px] ${
              met ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <span
              className={`size-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                met ? 'border-foreground bg-foreground' : 'border-border'
              }`}
            >
              {met && <Icon name="ph:check-bold" size={8} className="text-background" />}
            </span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
