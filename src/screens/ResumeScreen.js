import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ArtistShowMedia from '../components/ArtistShowMedia';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import ScaledPressable from '../components/ScaledPressable';
import MusicJourneyTimeline from '../components/MusicJourneyTimeline';
import GradientStatNumber from '../components/GradientStatNumber';
import { brandIconCircle } from '../constants/brandAssets';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';
import { useSimulatedRefresh } from '../hooks/useSimulatedFeed';
import {
  buildMilestones,
  computeGenreBreakdown,
  computeResumeStats,
  DNA_INLINE_LABEL_MIN_PCT,
  MUSIC_DNA_COLORS,
} from '../utils/resumeStats';

const TAGLINE_KEY = 'melo_resume_tagline';
const DEFAULT_TAGLINE = 'Concert addict since 2019';
const AVATAR = 80;
const MEM_COL_GAP = theme.spacing.xs;
const MEM_RADIUS = 12;

function useResumeTagline() {
  const [tagline, setTagline] = useState(DEFAULT_TAGLINE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(TAGLINE_KEY);
        if (!cancelled && v != null && v.trim()) {
          setTagline(v.trim());
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next) => {
    setTagline(next);
    try {
      await AsyncStorage.setItem(TAGLINE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { persist, tagline };
}

function ResumeStatCard({ delay, emoji, label, target }) {
  const ty = useRef(new Animated.Value(18)).current;
  const op = useRef(new Animated.Value(0)).current;
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const sub = animated.addListener(({ value }) => {
      setDisplay(Math.round(value));
    });
    Animated.parallel([
      Animated.timing(ty, {
        delay,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(op, {
        delay,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(animated, {
        delay: delay + 120,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        toValue: target,
        useNativeDriver: false,
      }),
    ]).start();
    return () => animated.removeListener(sub);
  }, [animated, delay, op, target, ty]);

  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Animated.View
        style={{
          opacity: op,
          transform: [{ translateY: ty }],
        }}
      >
        <GradientStatNumber size="resume" value={display} />
      </Animated.View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MusicDnaBar({ segments }) {
  if (!segments.length) {
    return (
      <Text style={styles.dnaEmpty}>
        Log shows with genres to see your Music DNA
      </Text>
    );
  }

  const legend = segments.filter((s) => s.pct < DNA_INLINE_LABEL_MIN_PCT);

  return (
    <>
      <View style={styles.dnaBarTrack}>
        {segments.map((s, i) => (
          <View
            key={s.genre}
            style={[
              styles.dnaSegment,
              {
                backgroundColor: MUSIC_DNA_COLORS[i % MUSIC_DNA_COLORS.length],
                flex: s.count,
              },
            ]}
          >
            {s.pct >= DNA_INLINE_LABEL_MIN_PCT ? (
              <Text numberOfLines={1} style={styles.dnaSegmentLabel}>
                {s.genre} {Math.round(s.pct * 100)}%
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {legend.length > 0 ? (
        <View style={styles.dnaLegend}>
          {legend.map((s, i) => {
            const idx = segments.indexOf(s);
            return (
              <View key={s.genre} style={styles.dnaLegendRow}>
                <View
                  style={[
                    styles.dnaLegendDot,
                    {
                      backgroundColor:
                        MUSIC_DNA_COLORS[idx % MUSIC_DNA_COLORS.length],
                    },
                  ]}
                />
                <Text style={styles.dnaLegendText}>
                  {s.genre} {Math.round(s.pct * 100)}%
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

function MilestoneCard({ item }) {
  const { description, emoji, name, unlocked } = item;
  return (
    <View
      style={[
        styles.milestoneCard,
        !unlocked && styles.milestoneCardLocked,
      ]}
    >
      {unlocked ? (
        <LinearGradient
          colors={theme.linearGradientColors}
          end={theme.linearGradientEnd}
          start={theme.linearGradientStart}
          style={styles.milestoneTopBorder}
        />
      ) : null}
      <Text style={styles.milestoneEmoji}>{emoji}</Text>
      <Text numberOfLines={2} style={styles.milestoneName}>
        {name}
      </Text>
      <Text numberOfLines={2} style={styles.milestoneDesc}>
        {description}
      </Text>
      {!unlocked ? (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockEmoji}>🔒</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ResumeScreen({ navigation }) {
  const scrollBottomPad = useMeloScrollBottomPadding();
  const { onRefresh, refreshing } = useSimulatedRefresh();
  const { width: windowWidth } = useWindowDimensions();
  const { attended } = useShows();
  const { persist, tagline } = useResumeTagline();
  const [editingTagline, setEditingTagline] = useState(false);
  const [draftTagline, setDraftTagline] = useState(tagline);

  useEffect(() => {
    if (!editingTagline) {
      setDraftTagline(tagline);
    }
  }, [editingTagline, tagline]);

  const stats = useMemo(() => computeResumeStats(attended), [attended]);
  const genreSegments = useMemo(
    () => computeGenreBreakdown(attended),
    [attended],
  );
  const milestones = useMemo(() => buildMilestones(stats), [stats]);
  const memories = useMemo(
    () =>
      [...attended].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      ),
    [attended],
  );

  const openShow = useCallback(
    (show) => {
      navigation.navigate('ShowDetail', { show, wishlist: false });
    },
    [navigation],
  );

  const finishTaglineEdit = useCallback(() => {
    const next = draftTagline.trim() || DEFAULT_TAGLINE;
    persist(next);
    setDraftTagline(next);
    setEditingTagline(false);
  }, [draftTagline, persist]);

  const gap = MEM_COL_GAP;
  const memThumb =
    (windowWidth - theme.spacing.md * 2 - gap * 2) / 3;
  const canGoBack = navigation.canGoBack?.() ?? false;

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
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
        style={styles.scrollFlex}
      >
        <View style={[styles.topBar, { paddingTop: MELO_BELOW_NOTCH_PADDING }]}>
          {canGoBack ? (
            <ScaledPressable
              hitSlop={12}
              onPress={() => navigation.goBack()}
              style={styles.backHit}
            >
              <Text style={styles.backText}>← Back</Text>
            </ScaledPressable>
          ) : null}
        </View>

        <View style={styles.hero}>
          <Image
            accessibilityLabel="Profile"
            resizeMode="cover"
            source={brandIconCircle}
            style={[
              styles.heroAvatar,
              { borderRadius: AVATAR / 2, height: AVATAR, width: AVATAR },
            ]}
          />
          <Text style={styles.heroName}>Aidan</Text>
          {editingTagline ? (
            <TextInput
              autoFocus
              multiline
              onBlur={finishTaglineEdit}
              onChangeText={setDraftTagline}
              onSubmitEditing={finishTaglineEdit}
              placeholder={DEFAULT_TAGLINE}
              placeholderTextColor={theme.muted}
              style={styles.taglineInput}
              value={draftTagline}
            />
          ) : (
            <ScaledPressable
              delayLongPress={380}
              onLongPress={() => {
                setDraftTagline(tagline);
                setEditingTagline(true);
              }}
            >
              <Text style={styles.tagline}>{tagline}</Text>
            </ScaledPressable>
          )}
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <ResumeStatCard
              delay={0}
              emoji="🎤"
              label="Total shows"
              target={stats.totalShows}
            />
            <View style={{ width: theme.spacing.sm }} />
            <ResumeStatCard
              delay={80}
              emoji="🎸"
              label="Unique artists"
              target={stats.uniqueArtists}
            />
          </View>
          <View style={{ height: theme.spacing.sm }} />
          <View style={styles.statRow}>
            <ResumeStatCard
              delay={160}
              emoji="📍"
              label="Cities visited"
              target={stats.citiesVisited}
            />
            <View style={{ width: theme.spacing.sm }} />
            <ResumeStatCard
              delay={240}
              emoji="🌍"
              label="Countries visited"
              target={stats.countriesVisited}
            />
          </View>
        </View>

        <ScaledPressable
          onPress={() => navigation.navigate('Stats')}
          style={styles.analyticsHit}
        >
          <LinearGradient
            colors={theme.linearGradientColors}
            end={theme.linearGradientEnd}
            start={theme.linearGradientStart}
            style={styles.analyticsCard}
          >
            <Text style={styles.analyticsTitle}>Concert analytics</Text>
            <Text style={styles.analyticsSub}>
              Charts, top venues, cities, travel distance, and more.
            </Text>
          </LinearGradient>
        </ScaledPressable>

        <ScaledPressable
          onPress={() => navigation.navigate('BuddiesHome')}
          style={styles.buddiesHit}
        >
          <View style={styles.buddiesCard}>
            <Text style={styles.buddiesTitle}>Concert buddies</Text>
            <Text style={styles.buddiesSub}>
              See your friends and shared shows.
            </Text>
          </View>
        </ScaledPressable>

        <Text style={styles.sectionTitle}>Music DNA</Text>
        <View style={styles.dnaCard}>
          <MusicDnaBar segments={genreSegments} />
        </View>

        <Text style={styles.sectionTitle}>Milestones</Text>
        <ScrollView
          contentContainerStyle={styles.milestoneScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {milestones.map((m) => (
            <View key={m.id} style={styles.milestoneWrap}>
              <MilestoneCard item={m} />
            </View>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Memories</Text>
        <View style={styles.memGrid}>
          {memories.map((show, index) => (
            <MemThumb
              key={show.id}
              endOfRow={(index + 1) % 3 === 0}
              gap={gap}
              onPress={() => openShow(show)}
              show={show}
              thumb={memThumb}
            />
          ))}
        </View>

        <MusicJourneyTimeline attended={attended} onOpenShow={openShow} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MemThumb({ endOfRow, gap, onPress, show, thumb }) {
  return (
    <ScaledPressable
      onPress={onPress}
      style={{
        height: thumb,
        marginBottom: gap,
        marginRight: endOfRow ? 0 : gap,
        width: thumb,
      }}
    >
      <ArtistShowMedia
        artistName={show.artist}
        borderRadius={MEM_RADIUS}
        fallbackUri={show.imageUrl}
        initialLetterSize={Math.round(thumb * 0.32)}
        style={{
          borderRadius: MEM_RADIUS,
          height: thumb,
          width: thumb,
        }}
      />
    </ScaledPressable>
  );
}

const styles = StyleSheet.create({
  backHit: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
  },
  backText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  analyticsCard: {
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...theme.rnShadowMd,
  },
  analyticsHit: {
    marginBottom: theme.spacing.lg,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  analyticsSub: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    lineHeight:
      theme.typography.fontSize.sm * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.xs,
    opacity: 0.95,
  },
  analyticsTitle: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.lg,
  },
  buddiesCard: {
    backgroundColor: theme.card,
    borderColor: theme.primary,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  buddiesHit: {
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
  },
  buddiesSub: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xs,
  },
  buddiesTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.lg,
  },
  dnaBarTrack: {
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    minHeight: 44,
    overflow: 'hidden',
    width: '100%',
  },
  dnaCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    marginHorizontal: theme.spacing.md,
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  dnaEmpty: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
  },
  dnaLegend: {
    marginTop: theme.spacing.sm,
  },
  dnaLegendDot: {
    borderRadius: 4,
    height: 8,
    marginRight: theme.spacing.xs,
    width: 8,
  },
  dnaLegendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: theme.spacing.xxs,
  },
  dnaLegendText: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 11 * theme.typography.lineHeight.normal,
  },
  dnaSegment: {
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: theme.spacing.xxs,
  },
  dnaSegmentLabel: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 11,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  heroAvatar: {
    backgroundColor: theme.borderLight,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  heroName: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 24,
    lineHeight: 24 * theme.typography.lineHeight.tight,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  lockEmoji: {
    fontSize: 28,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: theme.overlay.lockScrim,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
  },
  memGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  milestoneCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    minHeight: 128,
    overflow: 'hidden',
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    position: 'relative',
    width: 132,
    ...theme.rnShadowSm,
  },
  milestoneCardLocked: {
    opacity: 0.66,
  },
  milestoneDesc: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 10,
    lineHeight: 10 * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  milestoneEmoji: {
    fontSize: 28,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  milestoneName: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 12 * theme.typography.lineHeight.tight,
    textAlign: 'center',
  },
  milestoneScroll: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  milestoneTopBorder: {
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  milestoneWrap: {
    marginRight: theme.spacing.sm,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  sectionTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.lg,
    lineHeight:
      theme.typography.fontSize.lg * theme.typography.lineHeight.tight,
    marginBottom: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    flex: 1,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  statEmoji: {
    fontSize: 22,
    marginBottom: theme.spacing.xs,
  },
  statGrid: {
    paddingHorizontal: theme.spacing.md,
  },
  statLabel: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
  },
  tagline: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    lineHeight:
      theme.typography.fontSize.subtitle * theme.typography.lineHeight.normal,
    textAlign: 'center',
  },
  taglineInput: {
    borderBottomColor: theme.primary,
    borderBottomWidth: 1,
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    maxWidth: 320,
    minWidth: 200,
    paddingVertical: theme.spacing.xs,
    textAlign: 'center',
  },
  topBar: {
    paddingHorizontal: theme.spacing.md,
  },
});
