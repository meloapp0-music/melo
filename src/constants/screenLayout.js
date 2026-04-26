import theme from '../theme';

/**
 * Full safe-area edges: status bar / notch / Dynamic Island, home indicator, horizontal insets.
 * (Includes top + bottom per device spec.)
 */
export const MELO_SAFE_AREA_EDGES = ['top', 'right', 'bottom', 'left'];

/** Minimum horizontal inset for primary content (16px). */
export const MELO_HORIZONTAL_GUTTER = theme.spacing.md;

/**
 * Extra padding below the safe-area top inset so titles/content clear the notch
 * comfortably (minimum 16pt gap).
 */
export const MELO_BELOW_NOTCH_PADDING = Math.max(16, theme.spacing.md);
