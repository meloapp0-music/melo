import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import GradientStatNumber from './GradientStatNumber';
import theme from '../theme';

export default function StatPill({ delay = 0, emoji, label, target }) {
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = animated.addListener(({ value }) => {
      setDisplay(Math.round(value));
    });
    Animated.timing(animated, {
      delay,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      toValue: target,
      useNativeDriver: false,
    }).start();
    return () => animated.removeListener(id);
  }, [animated, delay, target]);

  return (
    <View style={styles.pill}>
      <Text style={styles.emoji}>{emoji}</Text>
      <GradientStatNumber value={display} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: {
    fontSize: theme.typography.fontSize.md,
    marginBottom: theme.spacing.xxs,
  },
  label: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.caption,
    lineHeight:
      theme.typography.fontSize.caption * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
    textAlign: 'center',
  },
  pill: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    flex: 1,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    ...theme.rnShadowSm,
  },
});
