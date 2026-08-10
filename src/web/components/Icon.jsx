// Icon — the Sleek designs' icon set, resolved locally.
// =====================================================
// Every Sleek screen references Phosphor icons as `<iconify-icon icon="ph:name">`,
// backed by a CDN script in the exported HTML. That script is a runtime fetch,
// which is unacceptable in a Capacitor app that has to work in a venue with no
// signal — so the CDN never ships. The official @phosphor-icons/react package
// gives the exact same glyphs, tree-shaken at build time.
//
// Usage mirrors the design source so a ported screen reads like its export:
//
//   <Icon name="ph:ticket-fill" size={28} />
//
// Phosphor splits weight out of the name (`ph:ticket-fill` is the Ticket glyph
// at weight="fill"), which is why the map below carries both.

import {
  ArrowLeft, ArrowRight, CameraPlus, ChartBar, Check, CheckCircle, Export,
  HouseSimple, LockKey, MagnifyingGlass, Plus, Quotes, Scissors, ScrollIcon,
  ShareFat, Sparkle, Ticket, User, UsersThree, X,
} from '@phosphor-icons/react';

// name -> [component, weight]. Keyed by the exact `ph:` string the exports use,
// so porting a screen is a copy rather than a translation. Adding a screen that
// needs a new glyph? Add the row; an unknown name renders nothing rather than
// throwing, because a missing icon should never take a screen down.
const ICONS = {
  'ph:arrow-left-bold': [ArrowLeft, 'bold'],
  'ph:arrow-right': [ArrowRight, 'regular'],
  'ph:arrow-right-bold': [ArrowRight, 'bold'],
  'ph:camera-plus': [CameraPlus, 'regular'],
  'ph:chart-bar': [ChartBar, 'regular'],
  'ph:chart-bar-fill': [ChartBar, 'fill'],
  'ph:check-bold': [Check, 'bold'],
  'ph:check-circle-fill': [CheckCircle, 'fill'],
  'ph:export-bold': [Export, 'bold'],
  'ph:house-simple': [HouseSimple, 'regular'],
  'ph:house-simple-fill': [HouseSimple, 'fill'],
  'ph:lock-key-fill': [LockKey, 'fill'],
  'ph:magnifying-glass': [MagnifyingGlass, 'regular'],
  'ph:magnifying-glass-bold': [MagnifyingGlass, 'bold'],
  'ph:plus-bold': [Plus, 'bold'],
  'ph:plus-light': [Plus, 'light'],
  'ph:quotes': [Quotes, 'regular'],
  'ph:scissors': [Scissors, 'regular'],
  'ph:scroll-fill': [ScrollIcon, 'fill'],
  'ph:share-fat': [ShareFat, 'regular'],
  'ph:share-fat-fill': [ShareFat, 'fill'],
  'ph:sparkle-fill': [Sparkle, 'fill'],
  'ph:ticket': [Ticket, 'regular'],
  'ph:ticket-fill': [Ticket, 'fill'],
  'ph:user': [User, 'regular'],
  'ph:user-fill': [User, 'fill'],
  'ph:users-three-light': [UsersThree, 'light'],
  'ph:x-bold': [X, 'bold'],
};

export default function Icon({ name, size = 24, className = '', ...rest }) {
  const entry = ICONS[name];
  if (!entry) {
    if (import.meta.env.DEV) console.warn('[Melo] unknown icon', name);
    return null;
  }
  const [Glyph, weight] = entry;
  // color defaults to currentColor, so the Tailwind text-* class on the parent
  // drives it exactly as it does in the export.
  return <Glyph size={size} weight={weight} className={className} {...rest} />;
}
