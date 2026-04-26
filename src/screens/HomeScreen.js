import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ArtistAvatar from '../components/ArtistAvatar';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import EmptyState from '../components/EmptyState';
import FeaturedShowCard from '../components/FeaturedShowCard';
import { brandIcon, brandIconCircle, brandLogoHorizontal } from '../constants/brandAssets';
import ScaledPressable from '../components/ScaledPressable';
import { ShimmerPlaceholder } from '../components/ShimmerPlaceholder';
import ShowCard from '../components/ShowCard';
import StatPill from '../components/StatPill';
import { useLogSheet } from '../context/LogSheetContext';
import {
  useSimulatedInitialLoad,
  useSimulatedRefresh,
} from '../hooks/useSimulatedFeed';
import {
  CURRENT_USER_FIRST_NAME,
  recentlySeenShows,
  stats,
  thisWeekShows,
  topRatedShow,
} from '../data/shows';
import theme from '../theme';

function greetingForHour(hour) {
  if (hour < 12) {
    return {
      emoji: '☀️',
      line: `Good morning, ${CURRENT_USER_FIRST_NAME}`,
    };
  }
  if (hour < 17) {
    return {
      emoji: '🎶',
      line: `Good afternoon, ${CURRENT_USER_FIRST_NAME}`,
    };
  }
  return {
    emoji: '🌙',
    line: `Good evening, ${CURRENT_USER_FIRST_NAME}`,
  };
}

function formatShowDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

function HomeSkeleton() {
  return (
    <View style={styles.skeletonRoot}>
      <Image
        resizeMode="contain"
        source={brandIcon}
        style={styles.skeletonBrandIcon}
      />
      <ShimmerPlaceholder borderRadius={10} height={22} width="60%" />
      <ShimmerPlaceholder borderRadius={8} height={14} style={{ marginTop: theme.spacing.sm }} width="85%" />
      <View style={styles.skeletonStats}>
        <ShimmerPlaceholder borderRadius={theme.radius.md} height={88} style={{ flex: 1 }} />
        <ShimmerPlaceholder borderRadius={theme.radius.md} height={88} style={{ flex: 1 }} />
        <ShimmerPlaceholder borderRadius={theme.radius.md} height={88} style={{ flex: 1 }} />
      </View>
      <ShimmerPlaceholder borderRadius={8} height={20} style={{ marginTop: theme.spacing.lg }} width="45%" />
      <ShimmerPlaceholder borderRadius={theme.radius.xl} height={theme.layout.showCardHeight} style={{ marginTop: theme.spacing.sm }} width={theme.layout.showCardWidth} />
    </View>
  );
}

function ThisWeekRow({ onPress, show }) {
  return (
    <ScaledPressable onPress={onPress} style={styles.weekRow}>
      <ArtistAvatar
        artistName={show.artist}
        fallbackUri={show.imageUrl}
        size={48}
        style={styles.weekAvatar}
      />
      <View style={styles.weekRowText}>
        <Text numberOfLines={1} style={styles.weekArtist}>
          {show.artist}
        </Text>
        <Text numberOfLines={1} style={styles.weekVenue}>
          {show.venue}
        </Text>
        <Text style={styles.weekDate}>{formatShowDate(show.date)}</Text>
      </View>
    </ScaledPressable>
  );
}

export default function HomeScreen({ navigation }) {
  const scrollBottomPad = useMeloScrollBottomPadding();
  const { openLog } = useLogSheet();
  const initialLoad = useSimulatedInitialLoad(420);
  const { onRefresh, refreshing } = useSimulatedRefresh();
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return greetingForHour(h);
  }, []);

  const subtitle = `You've seen ${stats.totalShows} shows. Keep going.`;

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      <View style={styles.homeFill}>
        <View pointerEvents="none" style={styles.homeGlowBlob}>
          {Platform.OS === 'web' ? (
            <View style={styles.homeGlowFallback} />
          ) : (
            <BlurView intensity={28} style={styles.homeGlowBlur} tint="light">
              <View style={styles.homeGlowTint} />
            </BlurView>
          )}
        </View>
        <View style={styles.homeFg}>
      <View style={[styles.header, { paddingTop: MELO_BELOW_NOTCH_PADDING }]}>
        <Image
          accessibilityLabel="Melo"
          resizeMode="contain"
          source={brandLogoHorizontal}
          style={styles.headerLogo}
        />
        <ScaledPressable
          accessibilityLabel="Open profile"
          onPress={() => navigation.navigate('Resume')}
        >
          <Image
            resizeMode="cover"
            source={brandIconCircle}
            style={[
              styles.avatarImage,
              {
                borderRadius: theme.radius.full,
                height: theme.layout.homeAvatar,
                width: theme.layout.homeAvatar,
              },
            ]}
          />
        </ScaledPressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPad },
        ]}
        refreshControl={
          <RefreshControl
            onRefresh={onRefresh}
            refreshing={refreshing}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {initialLoad ? (
          <HomeSkeleton />
        ) : (
          <>
            <View style={styles.greetingBlock}>
              <Text style={styles.greeting}>
                {greeting.line} {greeting.emoji}
              </Text>
              <Text style={styles.greetingSub}>{subtitle}</Text>
              <View style={styles.linkRow}>
                <ScaledPressable
                  hitSlop={theme.spacing.sm}
                  onPress={() =>
                    navigation.getParent()?.navigate('ShowsTab', {
                      screen: 'MyShows',
                    })
                  }
                >
                  <Text style={styles.logLink}>My shows</Text>
                </ScaledPressable>
                <ScaledPressable hitSlop={theme.spacing.sm} onPress={openLog}>
                  <Text style={styles.logLink}>+ Log a show</Text>
                </ScaledPressable>
              </View>
            </View>

            <View style={styles.statsRow}>
              <StatPill
                delay={0}
                emoji="🎤"
                label="Total shows"
                target={stats.totalShows}
              />
              <StatPill
                delay={120}
                emoji="🎸"
                label="Unique artists"
                target={stats.uniqueArtists}
              />
              <StatPill
                delay={240}
                emoji="📍"
                label="Cities"
                target={stats.cities}
              />
            </View>

            <ScaledPressable
              onPress={() => navigation.navigate('YearInReview')}
              style={styles.yearBannerHit}
            >
              <LinearGradient
                colors={theme.linearGradientColors}
                end={theme.linearGradientEnd}
                start={theme.linearGradientStart}
                style={styles.yearBanner}
              >
                <Text style={styles.yearBannerText}>
                  Your 2025 in Music — See your year
                </Text>
              </LinearGradient>
            </ScaledPressable>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recently Seen</Text>
              <ScaledPressable hitSlop={theme.spacing.sm}>
                <Text style={styles.seeAll}>See All</Text>
              </ScaledPressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.hScrollContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {recentlySeenShows.map((show) => (
                <ScaledPressable
                  key={show.id}
                  onPress={() =>
                    navigation.navigate('ShowDetail', {
                      show,
                      wishlist: false,
                    })
                  }
                >
                  <ShowCard show={show} />
                </ScaledPressable>
              ))}
            </ScrollView>

            <Text style={[styles.sectionTitle, styles.featuredHeading]}>
              Top Rated Show
            </Text>
            <ScaledPressable
              onPress={() =>
                navigation.navigate('ShowDetail', {
                  show: {
                    ...topRatedShow,
                    date: '2024-06-14T20:00:00.000Z',
                  },
                  wishlist: false,
                })
              }
            >
              <FeaturedShowCard show={topRatedShow} />
            </ScaledPressable>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>This Week</Text>
            </View>

            {thisWeekShows.length === 0 ? (
              <View style={styles.emptyWeek}>
                <EmptyState
                  ctaLabel="Log your first show"
                  emoji="📅"
                  message="Nothing logged yet this week"
                  onCtaPress={openLog}
                  subtitle="When you add a show, it will land here so you can relive the night."
                />
              </View>
            ) : (
              <View style={styles.weekList}>
                {thisWeekShows.map((show) => (
                  <ThisWeekRow
                    key={show.id}
                    onPress={() =>
                      navigation.navigate('ShowDetail', {
                        show,
                        wishlist: false,
                      })
                    }
                    show={show}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    backgroundColor: theme.borderLight,
  },
  headerLogo: {
    flexShrink: 1,
    height: theme.layout.headerLogoHeight,
    maxWidth: '62%',
    minWidth: 120,
  },
  skeletonBrandIcon: {
    alignSelf: 'flex-start',
    height: 48,
    marginBottom: theme.spacing.sm,
    width: 48,
  },
  emptyWeek: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    paddingVertical: theme.spacing.md,
  },
  featuredHeading: {
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xl,
  },
  greeting: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.lg,
    lineHeight:
      theme.typography.fontSize.lg * theme.typography.lineHeight.normal,
  },
  greetingBlock: {
    marginBottom: theme.spacing.lg,
  },
  greetingSub: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    lineHeight:
      theme.typography.fontSize.subtitle * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.xs,
  },
  hScrollContent: {
    paddingRight: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
    backgroundColor: theme.background,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  logLink: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.seeAll,
    lineHeight:
      theme.typography.fontSize.seeAll * theme.typography.lineHeight.normal,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  homeFg: {
    flex: 1,
    zIndex: 1,
  },
  homeFill: {
    flex: 1,
    position: 'relative',
  },
  homeGlowBlob: {
    height: 300,
    position: 'absolute',
    right: -72,
    top: -28,
    width: 300,
    zIndex: 0,
  },
  homeGlowBlur: {
    borderRadius: 150,
    height: 300,
    overflow: 'hidden',
    width: 300,
  },
  homeGlowFallback: {
    backgroundColor: 'rgba(244, 162, 97, 0.12)',
    borderRadius: 150,
    height: 300,
    width: 300,
  },
  homeGlowTint: {
    flex: 1,
    backgroundColor: 'rgba(244, 162, 97, 0.35)',
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xl,
  },
  sectionTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.sectionTitle,
    letterSpacing: theme.typography.letterSpacing.sectionTight,
    lineHeight:
      theme.typography.fontSize.sectionTitle *
      theme.typography.lineHeight.tight,
  },
  seeAll: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.seeAll,
    lineHeight:
      theme.typography.fontSize.seeAll * theme.typography.lineHeight.normal,
  },
  skeletonRoot: {
    paddingTop: theme.spacing.sm,
  },
  skeletonStats: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  weekArtist: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.md,
    lineHeight:
      theme.typography.fontSize.md * theme.typography.lineHeight.normal,
  },
  weekDate: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.caption,
    lineHeight:
      theme.typography.fontSize.caption * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  weekList: {
    gap: theme.spacing.sm,
  },
  weekAvatar: {
    marginRight: theme.spacing.sm,
  },
  weekRow: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  weekRowText: {
    flex: 1,
  },
  weekVenue: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    lineHeight:
      theme.typography.fontSize.subtitle * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  yearBanner: {
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...theme.rnShadowMd,
  },
  yearBannerHit: {
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  yearBannerText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    lineHeight:
      theme.typography.fontSize.md * theme.typography.lineHeight.normal,
    textAlign: 'center',
  },
});
