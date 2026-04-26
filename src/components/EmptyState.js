import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import ScaledPressable from './ScaledPressable';
import theme from '../theme';

/**
 * Centered empty feed: emoji, display title, Inter subtitle, gradient CTA.
 */
export default function EmptyState({
  ctaLabel,
  emoji = '🎵',
  message,
  onCtaPress,
  subtitle,
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{message}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <ScaledPressable
          accessibilityRole="button"
          onPress={onCtaPress}
          style={styles.ctaHit}
        >
          <LinearGradient
            colors={theme.linearGradientColors}
            end={theme.linearGradientEnd}
            start={theme.linearGradientStart}
            style={styles.ctaGrad}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </LinearGradient>
        </ScaledPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ctaGrad: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  ctaHit: {
    alignSelf: 'center',
    borderRadius: theme.radius.full,
    marginTop: theme.spacing.lg,
    overflow: 'hidden',
  },
  ctaText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.md,
    letterSpacing: theme.typography.letterSpacing.interUi,
    textAlign: 'center',
  },
  emoji: {
    fontSize: 40,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    letterSpacing: theme.typography.letterSpacing.interUi * 0.5,
    lineHeight:
      theme.typography.fontSize.subtitle * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    textAlign: 'center',
  },
  title: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.emptyStateTitle,
    lineHeight:
      theme.typography.fontSize.emptyStateTitle *
      theme.typography.lineHeight.tight,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
  },
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    maxWidth: 340,
    paddingVertical: theme.spacing.xxl,
  },
});
