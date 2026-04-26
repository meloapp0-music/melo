import { useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import theme from '../theme';

/**
 * Press feedback: spring scale to theme.interaction.pressScale while pressed.
 */
export default function ScaledPressable({
  children,
  contentStyle,
  disabled,
  style,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const run = (to) => {
    Animated.spring(scale, {
      friction: theme.interaction.pressSpringFriction,
      tension: theme.interaction.pressSpringTension,
      toValue: to,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) {
          run(theme.interaction.pressScale);
        }
      }}
      onPressOut={() => run(1)}
      {...rest}
    >
      <Animated.View style={[contentStyle, style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
