import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import theme from '../theme';

/**
 * Grey block with a sweeping highlight shimmer (loading skeleton).
 */
export function ShimmerPlaceholder({
  borderRadius = theme.radius.sm,
  height,
  style,
  width = '100%',
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        duration: 1400,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateX = anim.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, 1],
    outputRange: [-160, 360],
  });

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: theme.shimmer.base,
          borderRadius,
          height,
          width,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { overflow: 'hidden', transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={[
            theme.shimmer.base,
            theme.shimmer.highlight,
            theme.shimmer.base,
          ]}
          end={{ x: 1, y: 0.5 }}
          start={{ x: 0, y: 0.5 }}
          style={styles.grad}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
  },
  grad: {
    height: '100%',
    width: 200,
  },
});
