import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogSheetProvider } from './src/context/LogSheetContext';
import { ShowsProvider } from './src/context/ShowsContext';
import MeloSplash from './src/components/MeloSplash';
import MeloTabBar, {
  MELO_TAB_ROW_MIN_H,
  MELO_TAB_TOP_PAD,
} from './src/navigation/MeloTabBar';
import HomeScreen from './src/screens/HomeScreen';
import MyShowsScreen from './src/screens/MyShowsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ResumeScreen from './src/screens/ResumeScreen';
import ConcertMapScreen from './src/screens/ConcertMapScreen';
import RankScreen from './src/screens/RankScreen';
import SongsScreen from './src/screens/SongsScreen';
import ShowDetailScreen from './src/screens/ShowDetailScreen';
import StatsScreen from './src/screens/StatsScreen';
import YearInReviewScreen from './src/screens/YearInReviewScreen';
import BuddiesScreen from './src/screens/BuddiesScreen';
import BuddyDetailScreen from './src/screens/BuddyDetailScreen';
import { useMeloFonts } from './src/theme/fonts';
import theme from './src/theme';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const ShowsStack = createNativeStackNavigator();
const SongsStack = createNativeStackNavigator();
const MapStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

function HomeStackScreen() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        animation: 'default',
        contentStyle: { backgroundColor: theme.background, flex: 1 },
        headerShown: false,
      }}
    >
      <HomeStack.Screen component={HomeScreen} name="Home" />
      <HomeStack.Screen component={ResumeScreen} name="Resume" />
      <HomeStack.Screen component={ProfileScreen} name="Profile" />
      <HomeStack.Screen component={ShowDetailScreen} name="ShowDetail" />
      <HomeStack.Screen component={StatsScreen} name="Stats" />
      <HomeStack.Screen component={YearInReviewScreen} name="YearInReview" />
    </HomeStack.Navigator>
  );
}

function ShowsStackScreen() {
  return (
    <ShowsStack.Navigator
      screenOptions={{
        animation: 'default',
        contentStyle: { backgroundColor: theme.background, flex: 1 },
        headerShown: false,
      }}
    >
      <ShowsStack.Screen component={MyShowsScreen} name="MyShows" />
      <ShowsStack.Screen component={RankScreen} name="RankHome" />
      <ShowsStack.Screen component={ShowDetailScreen} name="ShowDetail" />
    </ShowsStack.Navigator>
  );
}

function MapStackScreen() {
  return (
    <MapStack.Navigator
      screenOptions={{
        animation: 'default',
        contentStyle: { backgroundColor: theme.background, flex: 1 },
        headerShown: false,
      }}
    >
      <MapStack.Screen component={ConcertMapScreen} name="ConcertMap" />
      <MapStack.Screen component={ShowDetailScreen} name="ShowDetail" />
    </MapStack.Navigator>
  );
}

function SongsStackScreen() {
  return (
    <SongsStack.Navigator
      screenOptions={{
        animation: 'default',
        contentStyle: { backgroundColor: theme.background, flex: 1 },
        headerShown: false,
      }}
    >
      <SongsStack.Screen component={SongsScreen} name="SongsHome" />
      <SongsStack.Screen component={ShowDetailScreen} name="ShowDetail" />
    </SongsStack.Navigator>
  );
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        animation: 'default',
        contentStyle: { backgroundColor: theme.background, flex: 1 },
        headerShown: false,
      }}
    >
      <ProfileStack.Screen component={ResumeScreen} name="ProfileHome" />
      <ProfileStack.Screen component={BuddiesScreen} name="BuddiesHome" />
      <ProfileStack.Screen component={BuddyDetailScreen} name="BuddyDetail" />
      <ProfileStack.Screen component={ShowDetailScreen} name="ShowDetail" />
      <ProfileStack.Screen component={StatsScreen} name="Stats" />
    </ProfileStack.Navigator>
  );
}

function MeloTabs() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = MELO_TAB_TOP_PAD + MELO_TAB_ROW_MIN_H + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: tabBarHeight,
        },
      }}
      tabBar={(props) => <MeloTabBar {...props} />}
    >
      <Tab.Screen
        component={HomeStackScreen}
        name="HomeTab"
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        component={ShowsStackScreen}
        name="ShowsTab"
        options={{ title: 'Shows' }}
      />
      <Tab.Screen
        component={SongsStackScreen}
        name="SongsTab"
        options={{ title: 'Songs' }}
      />
      <Tab.Screen
        component={MapStackScreen}
        name="MapTab"
        options={{ title: 'Map' }}
      />
      <Tab.Screen
        component={ProfileStackScreen}
        name="ProfileTab"
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

function AppContent({ fontError, fontsLoaded, splashDone, setSplashDone }) {
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <ShowsProvider>
        <LogSheetProvider>
          <View style={styles.appShell}>
            <NavigationContainer>
              <MeloTabs />
            </NavigationContainer>
            {!splashDone ? (
              <MeloSplash onDone={() => setSplashDone(true)} />
            ) : null}
          </View>
          <StatusBar style="dark" />
        </LogSheetProvider>
      </ShowsProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useMeloFonts();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  return (
    <SafeAreaProvider style={styles.flex}>
      <AppContent
        fontError={fontError}
        fontsLoaded={fontsLoaded}
        setSplashDone={setSplashDone}
        splashDone={splashDone}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loadingRoot: {
    alignItems: 'center',
    backgroundColor: theme.background,
    flex: 1,
    justifyContent: 'center',
  },
});
