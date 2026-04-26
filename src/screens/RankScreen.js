import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ArtistShowMedia from '../components/ArtistShowMedia';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useArtistImage } from '../hooks/useArtistImage';
import { artistAccentColor } from '../utils/artistAccent';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import EmptyState from '../components/EmptyState';
import ScaledPressable from '../components/ScaledPressable';
import { ShimmerPlaceholder } from '../components/ShimmerPlaceholder';
import { useLogSheet } from '../context/LogSheetContext';
import { useShows } from '../context/ShowsContext';
import {
  useSimulatedInitialLoad,
  useSimulatedRefresh,
} from '../hooks/useSimulatedFeed';
import theme from '../theme';

const { height: WIN_H, width: WIN_W } = Dimensions.get('window');

function formatBattleDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pickRandomPair(shows) {
  if (shows.length < 2) {
    return null;
  }
  const a = shows[Math.floor(Math.random() * shows.length)];
  let b = shows[Math.floor(Math.random() * shows.length)];
  let guard = 0;
  while (b.id === a.id && guard < 40) {
    b = shows[Math.floor(Math.random() * shows.length)];
    guard += 1;
  }
  if (b.id === a.id) {
    return null;
  }
  return [a, b];
}

function BattleCard({
  animatedGlow,
  animatedInner,
  onOpenDetail,
  onPress,
  show,
}) {
  const { displayUri } = useArtistImage(show.artist, show.imageUrl);
  const accent = artistAccentColor(show.artist);
  return (
    <Animated.View style={[styles.battleGlow, animatedGlow]}>
      {displayUri ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          pointerEvents="none"
          source={{ uri: displayUri }}
          style={styles.battleAuraImg}
          transition={200}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[
            styles.battleAuraImg,
            { backgroundColor: `${accent}66` },
          ]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          styles.battleAuraTint,
          { backgroundColor: accent },
        ]}
      />
      <Animated.View style={[styles.battleInner, animatedInner]}>
        <Pressable
          disabled={!onPress}
          onPress={onPress}
          style={styles.battleCardPressable}
        >
          <ArtistShowMedia
            artistName={show.artist}
            borderRadius={theme.radius.xl}
            fallbackUri={show.imageUrl}
            initialLetterSize={38}
            style={{
              borderRadius: theme.radius.xl,
              height: theme.layout.rankBattleCard,
              width: '100%',
            }}
          >
            <LinearGradient
              colors={theme.overlay.imageCardBottom65Colors}
              end={{ x: 0.5, y: 1 }}
              locations={theme.overlay.imageCardBottom65Locations}
              start={{ x: 0.5, y: 0 }}
              style={[
                styles.battleGrad,
                { borderRadius: theme.radius.xl },
              ]}
            >
              <View style={styles.battleTextBlock}>
                <Text numberOfLines={2} style={styles.battleArtist}>
                  {show.artist}
                </Text>
                <Text numberOfLines={1} style={styles.battleVenue}>
                  {show.venue}
                </Text>
                <Text style={styles.battleDate}>
                  {formatBattleDate(show.date)}
                </Text>
              </View>
            </LinearGradient>
          </ArtistShowMedia>
        </Pressable>
        <Pressable
          accessibilityLabel="Open show details"
          hitSlop={10}
          onPress={() => onOpenDetail?.(show)}
          style={styles.battleDetailHit}
        >
          <Ionicons
            color="rgba(255,255,255,0.95)"
            name="information-circle"
            size={30}
          />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function PodiumCard({
  accentColor,
  badge,
  elo,
  height,
  onOpenDetail,
  rank,
  show,
}) {
  return (
    <ScaledPressable
      onPress={() => onOpenDetail?.(show)}
      style={[
        styles.podiumShell,
        {
          borderLeftColor: accentColor,
          height,
          maxWidth: (WIN_W - theme.spacing.md * 2 - theme.spacing.sm * 2) / 3,
        },
      ]}
    >
      <ArtistShowMedia
        artistName={show.artist}
        borderRadius={theme.radius.lg}
        fallbackUri={show.imageUrl}
        initialLetterSize={Math.min(40, height * 0.14)}
        style={[styles.podiumImage, { borderRadius: theme.radius.lg, height }]}
      >
        <LinearGradient
          colors={theme.overlay.imageCardBottom65Colors}
          end={{ x: 0.5, y: 1 }}
          locations={theme.overlay.imageCardBottom65Locations}
          start={{ x: 0.5, y: 0 }}
          style={[styles.podiumGrad, { borderRadius: theme.radius.lg }]}
        >
          <Text style={styles.podiumBadge}>{badge}</Text>
          <Text style={[styles.podiumRankNum, { color: accentColor }]}>
            {rank}
          </Text>
          <View style={styles.podiumBottom}>
            <Text numberOfLines={2} style={styles.podiumArtist}>
              {show.artist}
            </Text>
            <Text numberOfLines={1} style={styles.podiumVenue}>
              {show.venue}
            </Text>
            <Text style={styles.podiumElo}>{Math.round(elo)}</Text>
          </View>
        </LinearGradient>
      </ArtistShowMedia>
    </ScaledPressable>
  );
}

export default function RankScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = useMeloScrollBottomPadding();
  const { onRefresh, refreshing } = useSimulatedRefresh();
  const rankLoad = useSimulatedInitialLoad(400);
  const { openLog } = useLogSheet();
  const {
    attended,
    battlesToday,
    eloById,
    rankedAttended,
    recordBattle,
  } = useShows();

  const [mode, setMode] = useState('battle');
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const fadeWrap = useRef(new Animated.Value(1)).current;
  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;
  const opA = useRef(new Animated.Value(1)).current;
  const opB = useRef(new Animated.Value(1)).current;
  const tyA = useRef(new Animated.Value(0)).current;
  const tyB = useRef(new Animated.Value(0)).current;
  const glowA = useRef(new Animated.Value(0)).current;
  const glowB = useRef(new Animated.Value(0)).current;

  const prevTopRef = useRef(null);
  const rankInit = useRef(false);

  useEffect(() => {
    const top = rankedAttended[0]?.id;
    if (!rankInit.current) {
      rankInit.current = true;
      prevTopRef.current = top;
      return;
    }
    if (top && prevTopRef.current && top !== prevTopRef.current) {
      setShowConfetti(true);
    }
    prevTopRef.current = top;
  }, [rankedAttended]);

  useEffect(() => {
    if (!showConfetti) {
      return undefined;
    }
    const t = setTimeout(() => setShowConfetti(false), 2000);
    return () => clearTimeout(t);
  }, [showConfetti]);

  const attendedRef = useRef(attended);
  attendedRef.current = attended;

  useEffect(() => {
    setPair(pickRandomPair(attendedRef.current));
  }, [attended.length]);

  const resetBattleAnims = useCallback(() => {
    scaleA.setValue(1);
    scaleB.setValue(1);
    opA.setValue(1);
    opB.setValue(1);
    tyA.setValue(0);
    tyB.setValue(0);
    glowA.setValue(0);
    glowB.setValue(0);
  }, [glowA, glowB, opA, opB, scaleA, scaleB, tyA, tyB]);

  const runWinSequence = useCallback(
    (winnerIdx) => {
      if (!pair || busy) {
        return;
      }
      setBusy(true);
      const winScale = winnerIdx === 0 ? scaleA : scaleB;
      const loseOp = winnerIdx === 0 ? opB : opA;
      const loseTy = winnerIdx === 0 ? tyB : tyA;
      const winGlow = winnerIdx === 0 ? glowA : glowB;

      const pulseGlow = Animated.sequence([
        Animated.timing(winGlow, {
          duration: 150,
          toValue: 0.75,
          useNativeDriver: false,
        }),
        Animated.timing(winGlow, {
          duration: 150,
          toValue: 0.28,
          useNativeDriver: false,
        }),
      ]);

      Animated.sequence([
        Animated.parallel([
          Animated.timing(winScale, {
            duration: 300,
            toValue: 1.04,
            useNativeDriver: true,
          }),
          pulseGlow,
          Animated.timing(loseOp, {
            duration: 300,
            toValue: 0.35,
            useNativeDriver: true,
          }),
          Animated.timing(loseTy, {
            duration: 300,
            toValue: 16,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(300),
        Animated.timing(fadeWrap, {
          duration: 280,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const w = pair[winnerIdx];
        const l = pair[1 - winnerIdx];
        recordBattle(w.id, l.id);
        const next = pickRandomPair(attendedRef.current);
        setPair(next);
        resetBattleAnims();
        fadeWrap.setValue(0);
        Animated.timing(fadeWrap, {
          duration: 240,
          toValue: 1,
          useNativeDriver: true,
        }).start(() => setBusy(false));
      });
    },
    [
      busy,
      fadeWrap,
      glowA,
      glowB,
      opA,
      opB,
      pair,
      recordBattle,
      resetBattleAnims,
      scaleA,
      scaleB,
      tyA,
      tyB,
    ],
  );

  const rest = useMemo(() => rankedAttended.slice(3), [rankedAttended]);

  const emptyBattle = attended.length < 2;

  const openShowDetail = useCallback(
    (show) => {
      navigation.navigate('ShowDetail', { show, wishlist: false });
    },
    [navigation],
  );

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      {showConfetti && Platform.OS !== 'web' ? (
        <View
          pointerEvents="none"
          style={[styles.confettiLayer, { top: insets.top }]}
        >
          <ConfettiCannon
            colors={[
              theme.primary,
              theme.amber,
              theme.podiumGold,
              theme.card,
              theme.podiumSilver,
            ]}
            count={300}
            explosionSpeed={480}
            fadeOut
            fallSpeed={2000}
            origin={{ x: WIN_W / 2, y: WIN_H * 0.22 }}
          />
        </View>
      ) : null}

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
        {rankLoad ? (
          <View
            style={[
              styles.rankSkeleton,
              { paddingTop: MELO_BELOW_NOTCH_PADDING },
            ]}
          >
            <ShimmerPlaceholder borderRadius={10} height={28} width="70%" />
            <ShimmerPlaceholder borderRadius={8} height={14} style={{ marginTop: theme.spacing.sm }} width="90%" />
            <ShimmerPlaceholder borderRadius={theme.radius.xl} height={theme.layout.rankBattleCard} style={{ marginTop: theme.spacing.lg }} />
          </View>
        ) : (
          <>
        <View
          style={[
            styles.titleRow,
            { paddingTop: MELO_BELOW_NOTCH_PADDING },
          ]}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Rank Your Shows</Text>
            <Text style={styles.subtitle}>
              Pick the better show. Rankings update live.
            </Text>
          </View>
          {mode === 'battle' && !emptyBattle ? (
            <Text style={styles.battlesToday}>
              Battles today · {battlesToday}
            </Text>
          ) : (
            <View style={styles.battlesPlaceholder} />
          )}
        </View>

        <View style={styles.modeRow}>
          <ScaledPressable
            onPress={() => setMode('battle')}
            style={styles.modeHit}
          >
            {mode === 'battle' ? (
              <LinearGradient
                colors={theme.linearGradientColors}
                end={theme.linearGradientEnd}
                start={theme.linearGradientStart}
                style={styles.modeOn}
              >
                <Text style={styles.modeOnText}>Battle</Text>
              </LinearGradient>
            ) : (
              <View style={styles.modeOff}>
                <Text style={styles.modeOffText}>Battle</Text>
              </View>
            )}
          </ScaledPressable>
          <ScaledPressable
            onPress={() => setMode('rankings')}
            style={styles.modeHit}
          >
            {mode === 'rankings' ? (
              <LinearGradient
                colors={theme.linearGradientColors}
                end={theme.linearGradientEnd}
                start={theme.linearGradientStart}
                style={styles.modeOn}
              >
                <Text style={styles.modeOnText}>Rankings</Text>
              </LinearGradient>
            ) : (
              <View style={styles.modeOff}>
                <Text style={styles.modeOffText}>Rankings</Text>
              </View>
            )}
          </ScaledPressable>
        </View>

        {mode === 'battle' ? (
          emptyBattle ? (
            <View style={styles.emptyBattle}>
              <EmptyState
                ctaLabel="Go to Home"
                emoji="⚔️"
                message="Need at least two shows"
                onCtaPress={() =>
                  navigation.navigate('HomeTab', { screen: 'Home' })
                }
                subtitle="Log a few gigs first, then come back to battle them head-to-head."
              />
            </View>
          ) : pair ? (
            <Animated.View style={{ opacity: fadeWrap }}>
              <BattleCard
                animatedGlow={{
                  elevation: 10,
                  shadowColor: theme.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: glowA.interpolate({
                    extrapolate: 'clamp',
                    inputRange: [0, 0.8],
                    outputRange: [0.08, 0.55],
                  }),
                  shadowRadius: 26,
                }}
                animatedInner={{
                  opacity: opA,
                  transform: [{ scale: scaleA }, { translateY: tyA }],
                }}
                onOpenDetail={openShowDetail}
                onPress={() => runWinSequence(0)}
                show={pair[0]}
              />
              <View style={styles.vsWrap}>
                <View style={[styles.vsPill, { borderRadius: theme.radius.full }]}>
                  <Text style={styles.vsText}>VS</Text>
                </View>
              </View>
              <BattleCard
                animatedGlow={{
                  elevation: 10,
                  shadowColor: theme.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: glowB.interpolate({
                    extrapolate: 'clamp',
                    inputRange: [0, 0.8],
                    outputRange: [0.08, 0.55],
                  }),
                  shadowRadius: 26,
                }}
                animatedInner={{
                  opacity: opB,
                  transform: [{ scale: scaleB }, { translateY: tyB }],
                }}
                onOpenDetail={openShowDetail}
                onPress={() => runWinSequence(1)}
                show={pair[1]}
              />
            </Animated.View>
          ) : (
            <Text style={styles.emptyBody}>Could not pick a matchup.</Text>
          )
        ) : (
          <View style={styles.rankingsBlock}>
            {rankedAttended.length === 0 ? (
              <EmptyState
                ctaLabel="Log a show"
                emoji="🏆"
                message="No attended shows yet"
                onCtaPress={openLog}
                subtitle="Log a concert to start ranking your nights out."
              />
            ) : (
              <>
                <View style={styles.podiumRow}>
                  {rankedAttended[1] ? (
                    <PodiumCard
                      accentColor={theme.podiumSilver}
                      badge="🥈"
                      elo={eloById[rankedAttended[1].id] ?? 1500}
                      height={theme.layout.podium2}
                      onOpenDetail={openShowDetail}
                      rank={2}
                      show={rankedAttended[1]}
                    />
                  ) : (
                    <View style={styles.podiumSpacer} />
                  )}
                  {rankedAttended[0] ? (
                    <PodiumCard
                      accentColor={theme.podiumGold}
                      badge="👑"
                      elo={eloById[rankedAttended[0].id] ?? 1500}
                      height={theme.layout.podium1}
                      onOpenDetail={openShowDetail}
                      rank={1}
                      show={rankedAttended[0]}
                    />
                  ) : null}
                  {rankedAttended[2] ? (
                    <PodiumCard
                      accentColor={theme.podiumBronze}
                      badge="🥉"
                      elo={eloById[rankedAttended[2].id] ?? 1500}
                      height={theme.layout.podium3}
                      onOpenDetail={openShowDetail}
                      rank={3}
                      show={rankedAttended[2]}
                    />
                  ) : (
                    <View style={styles.podiumSpacer} />
                  )}
                </View>
                <View style={styles.listRest}>
                  {rest.map((show, idx) => {
                    const rank = idx + 4;
                    const elo = eloById[show.id] ?? 1500;
                    return (
                      <ScaledPressable
                        key={show.id}
                        onPress={() => openShowDetail(show)}
                        style={[styles.listRow, { borderRadius: theme.radius.md }]}
                      >
                        <Text style={styles.listRankNum}>{rank}</Text>
                        <View style={styles.listMid}>
                          <Text numberOfLines={1} style={styles.listArtist}>
                            {show.artist}
                          </Text>
                          <Text numberOfLines={1} style={styles.listVenue}>
                            {show.venue}
                          </Text>
                        </View>
                        <Text style={styles.listElo}>{Math.round(elo)}</Text>
                      </ScaledPressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  battleArtist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankBattleArtist,
    lineHeight:
      theme.typography.fontSize.rankBattleArtist *
      theme.typography.lineHeight.tight,
  },
  battleDate: {
    color: theme.overlay.dateOnBattle,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.caption,
    marginTop: theme.spacing.xxs,
  },
  battleAuraImg: {
    borderRadius: theme.radius.xxxl,
    height: '135%',
    left: '-18%',
    opacity: 0.42,
    position: 'absolute',
    top: '-14%',
    width: '136%',
    zIndex: 0,
  },
  battleAuraTint: {
    borderRadius: theme.radius.xxxl,
    height: '125%',
    left: '-14%',
    opacity: 0.22,
    position: 'absolute',
    top: '-12%',
    width: '128%',
    zIndex: 0,
  },
  battleGlow: {
    borderRadius: theme.radius.xl,
    overflow: 'visible',
    position: 'relative',
  },
  battleGrad: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  battleCardPressable: {
    flex: 1,
  },
  battleDetailHit: {
    padding: theme.spacing.xs,
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
    zIndex: 8,
  },
  battleInner: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  battleTextBlock: {
    padding: theme.spacing.md,
  },
  battleVenue: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.myShowsListSub,
    marginTop: theme.spacing.xxs,
  },
  battlesPlaceholder: {
    minWidth: theme.spacing.xxxl,
  },
  battlesToday: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.rankBattlesToday,
    lineHeight:
      theme.typography.fontSize.rankBattlesToday *
      theme.typography.lineHeight.normal,
    maxWidth: WIN_W * 0.42,
    textAlign: 'right',
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  emptyBattle: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
  },
  emptyBody: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  emptyCtaText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  emptyTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    textAlign: 'center',
  },
  listArtist: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.rankListArtist,
    lineHeight:
      theme.typography.fontSize.rankListArtist *
      theme.typography.lineHeight.normal,
  },
  listElo: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankListElo,
    marginLeft: theme.spacing.sm,
  },
  listMid: {
    flex: 1,
    marginHorizontal: theme.spacing.sm,
  },
  listRankNum: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankListNum,
    minWidth: theme.spacing.xl,
  },
  listRest: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  listRow: {
    alignItems: 'center',
    backgroundColor: theme.card,
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.rnShadowSm,
  },
  listVenue: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.rankListVenue,
    marginTop: theme.spacing.xxs,
  },
  modeHit: {
    flex: 1,
  },
  modeOff: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    marginHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  modeOffText: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.rankModeChip,
  },
  modeOn: {
    alignItems: 'center',
    borderRadius: theme.radius.full,
    marginHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  modeOnText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.rankModeChip,
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
  },
  podiumArtist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankPodiumArtist,
    lineHeight:
      theme.typography.fontSize.rankPodiumArtist *
      theme.typography.lineHeight.tight,
  },
  podiumBadge: {
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.xl,
    left: theme.spacing.sm,
    position: 'absolute',
    top: theme.spacing.sm,
  },
  podiumBottom: {
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    position: 'absolute',
    right: theme.spacing.sm,
  },
  podiumElo: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xxs,
  },
  podiumGrad: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  podiumImage: {
    overflow: 'hidden',
    width: '100%',
  },
  podiumRankNum: {
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankPodiumNum,
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
  },
  podiumRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  podiumShell: {
    borderLeftWidth: 3,
    flex: 1,
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    ...theme.rnShadowMd,
  },
  podiumSpacer: {
    flex: 1,
  },
  podiumVenue: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.myShowsListSub,
    marginTop: theme.spacing.xxs,
  },
  rankingsBlock: {
    marginTop: theme.spacing.sm,
  },
  rankSkeleton: {},
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
  },
  subtitle: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.rankSubtitle,
    lineHeight:
      theme.typography.fontSize.rankSubtitle *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  title: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankScreenTitle,
    letterSpacing: theme.typography.letterSpacing.rankScreenTitle,
    lineHeight:
      theme.typography.fontSize.rankScreenTitle *
      theme.typography.lineHeight.tight,
  },
  titleBlock: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  vsPill: {
    alignItems: 'center',
    backgroundColor: theme.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    ...theme.rnShadowSm,
  },
  vsText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.rankVs,
    lineHeight:
      theme.typography.fontSize.rankVs * theme.typography.lineHeight.tight,
  },
  vsWrap: {
    alignItems: 'center',
    marginVertical: -theme.spacing.md,
    zIndex: 2,
  },
});
