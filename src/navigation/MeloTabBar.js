import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useContext, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useLogSheet } from '../context/LogSheetContext';
import theme from '../theme';

export const MELO_TAB_ROW_MIN_H = 80;
export const MELO_TAB_TOP_PAD = 0;

const FAB_SIZE = 52;
const FAB_RADIUS = 26;
const PLUS_SIZE = 22;
const ACTIVE = '#E8573A';
const INACTIVE = '#A8A29E';

const TAB_CONFIG = {
  HomeTab: { activeIcon: 'home', icon: 'home-outline', label: 'Home' },
  ShowsTab: {
    activeIcon: 'ticket',
    icon: 'ticket-outline',
    label: 'Shows',
  },
  SongsTab: {
    activeIcon: 'musical-notes',
    icon: 'musical-notes-outline',
    label: 'Songs',
  },
  MapTab: {
    activeIcon: 'map',
    icon: 'map-outline',
    label: 'Map',
  },
  ProfileTab: {
    activeIcon: 'person',
    icon: 'person-outline',
    label: 'Profile',
  },
};

function springScale(to) {
  return {
    friction: theme.interaction.pressSpringFriction,
    tension: theme.interaction.pressSpringTension,
    toValue: to,
    useNativeDriver: true,
  };
}

function MeloTabItem({
  config,
  isFocused,
  onPress,
  onLongPress,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const color = isFocused ? ACTIVE : INACTIVE;
  const iconName = isFocused ? config.activeIcon : config.icon;
  const run = (v) => Animated.spring(scale, springScale(v)).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={() => run(theme.interaction.pressScale)}
      onPressOut={() => run(1)}
      style={styles.tabHit}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
        <Ionicons color={color} name={iconName} size={22} />
        <Text
          ellipsizeMode="clip"
          numberOfLines={1}
          style={[styles.tabLabel, { color }]}
        >
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function MeloTabBar({ navigation, state }) {
  const onTabBarHeight = useContext(BottomTabBarHeightCallbackContext);
  const { openLog } = useLogSheet();
  const plusScale = useRef(new Animated.Value(1)).current;
  const runPlus = (v) => Animated.spring(plusScale, springScale(v)).start();

  const onTabPress = useCallback(
    (route, index) => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const event = navigation.emit({
        canPreventDefault: true,
        target: route.key,
        type: 'tabPress',
      });

      if (state.index !== index && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    },
    [navigation, state.index],
  );

  const onFabPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    openLog();
  }, [openLog]);

  const routeByName = useCallback(
    (name) => state.routes.find((r) => r.name === name),
    [state.routes],
  );
  const tabItem = (name) => {
    const route = routeByName(name);
    if (!route) {
      return <View key={name} style={styles.tabHit} />;
    }
    const idx = state.routes.findIndex((r) => r.key === route.key);
    return (
      <MeloTabItem
        key={name}
        config={TAB_CONFIG[name]}
        isFocused={state.index === idx}
        onLongPress={() =>
          navigation.emit({
            target: route.key,
            type: 'tabLongPress',
          })
        }
        onPress={() => onTabPress(route, idx)}
      />
    );
  };

  return (
    <View
      onLayout={(e) => {
        onTabBarHeight?.(e.nativeEvent.layout.height);
      }}
      style={styles.wrapper}
    >
      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.barOuter,
          {
            borderTopColor: theme.tabBar.topBorder,
            shadowColor: theme.tabBar.shadow,
          },
        ]}
      >
        <View
          style={[
            styles.row,
            { minHeight: MELO_TAB_ROW_MIN_H },
          ]}
        >
          {tabItem('HomeTab')}
          {tabItem('ShowsTab')}
          {tabItem('SongsTab')}
          <Pressable
            accessibilityLabel="Log a show"
            onPress={onFabPress}
            onPressIn={() => runPlus(theme.interaction.pressScale)}
            onPressOut={() => runPlus(1)}
            style={styles.plusSlot}
          >
            <Animated.View
              style={[
                styles.plusShadow,
                { transform: [{ scale: plusScale }] },
              ]}
            >
              <LinearGradient
                colors={theme.linearGradientColors}
                end={theme.linearGradientEnd}
                start={theme.linearGradientStart}
                style={styles.plusButton}
              >
                <Ionicons color="#FFFFFF" name="add" size={PLUS_SIZE} />
              </LinearGradient>
            </Animated.View>
          </Pressable>
          {tabItem('MapTab')}
          {tabItem('ProfileTab')}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    width: '100%',
    ...Platform.select({
      android: {
        elevation: 8,
      },
      ios: {
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
      default: {
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
    }),
  },
  plusButton: {
    alignItems: 'center',
    borderRadius: FAB_RADIUS,
    height: FAB_SIZE,
    justifyContent: 'center',
    width: FAB_SIZE,
  },
  plusShadow: {
    elevation: 12,
    shadowColor: theme.fab.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  plusSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  tabHit: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  tabLabel: {
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 9,
    letterSpacing: theme.typography.letterSpacing.interUi * 0.4,
    lineHeight: 9 * theme.typography.lineHeight.normal,
    marginTop: 2,
    textAlign: 'center',
  },
  wrapper: {
    backgroundColor: theme.tabBar.background,
    width: '100%',
  },
});
