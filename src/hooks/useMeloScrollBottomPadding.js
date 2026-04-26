import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import theme from '../theme';

/**
 * Bottom padding for scroll/list content so the last items clear the custom tab bar + home indicator.
 */
export function useMeloScrollBottomPadding(extra = theme.spacing.md) {
  const tabBarHeight = useBottomTabBarHeight();
  return tabBarHeight + extra;
}
