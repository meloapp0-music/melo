import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { brandWordmark } from '../constants/brandAssets';
import { MELO_SAFE_AREA_EDGES } from '../constants/screenLayout';
import theme from '../theme';

const FADE_MS = 800;

export default function MeloSplash({ onDone }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      duration: FADE_MS,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onDone?.();
      }
    });
  }, [onDone, opacity]);

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.safeFill}>
        <View style={styles.inner}>
          <Image
            accessibilityLabel="Melo"
            resizeMode="contain"
            source={brandWordmark}
            style={styles.wordmark}
          />
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.background,
    zIndex: 999,
  },
  safeFill: {
    backgroundColor: theme.background,
    flex: 1,
  },
  wordmark: {
    height: 56,
    maxWidth: 280,
    width: '100%',
  },
});
