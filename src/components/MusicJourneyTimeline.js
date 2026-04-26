import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ArtistShowMedia from './ArtistShowMedia';
import ScaledPressable from './ScaledPressable';
import { buildMusicJourneyTimeline } from '../utils/musicTimeline';
import theme from '../theme';

const ORANGE = '#E8573A';
const INK = '#1C1917';
const MUTED = '#78716C';
const DATE_MUTED = '#A8A29E';
const LINE_W = 2;
const GUTTER = 44;
const TRACK = 28;
const LINE_X = TRACK / 2 - LINE_W / 2;
const NODE_SHOW = 10;
/** Diameter for year marker on line — fits 13px label inside. */
const YEAR_MARKER_D = 32;

function formatCardDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PulsingEndDot() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          toValue: 1.35,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View
      style={[
        styles.pulseDot,
        {
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function TimelineTrack({ children }) {
  return (
    <View style={styles.trackCol}>
      <View style={styles.trackLine} />
      <View style={styles.trackDotWrap}>{children}</View>
    </View>
  );
}

function YearMarkerOnLine({ year }) {
  const short = String(year).slice(-2);
  return (
    <View
      style={[
        styles.yearNodeCircle,
        {
          borderRadius: YEAR_MARKER_D / 2,
          height: YEAR_MARKER_D,
          minWidth: YEAR_MARKER_D,
          width: YEAR_MARKER_D,
        },
      ]}
    >
      <Text style={styles.yearNodeText}>{short}</Text>
    </View>
  );
}

function ShowTimelineCard({ onPress, show }) {
  const score =
    typeof show.score === 'number' && !Number.isNaN(show.score)
      ? show.score.toFixed(1)
      : '—';
  return (
    <ScaledPressable onPress={onPress} style={styles.showCard}>
      <ArtistShowMedia
        artistName={show.artist}
        borderRadius={26}
        fallbackUri={show.imageUrl}
        initialLetterSize={22}
        style={styles.showAvatar}
      />
      <View style={styles.showCardMid}>
        <Text numberOfLines={2} style={styles.showArtist}>
          {show.artist}
        </Text>
        <Text numberOfLines={2} style={styles.showVenueCity}>
          {[show.venue, show.city].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.showDate}>{formatCardDate(show.date)}</Text>
      </View>
      <View style={styles.scorePill}>
        <Text style={styles.scorePillText}>{score}</Text>
      </View>
    </ScaledPressable>
  );
}

export default function MusicJourneyTimeline({ attended, onOpenShow }) {
  const { firstShow, yearGroups } = useMemo(
    () => buildMusicJourneyTimeline(attended),
    [attended],
  );

  if (!firstShow || yearGroups.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.journeyTitle}>Your Music Journey</Text>
        <Text style={styles.journeySubtitle}>Every show, every chapter</Text>
        <Text style={styles.timelineEmpty}>
          Log shows to see your journey unfold.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.journeyTitle}>Your Music Journey</Text>
      <Text style={styles.journeySubtitle}>Every show, every chapter</Text>

      {/* Chapter 1 */}
      <View style={styles.row}>
        <View style={styles.gutter} />
        <TimelineTrack>
          <View
            style={[
              styles.showDot,
              {
                borderRadius: NODE_SHOW / 2,
                height: NODE_SHOW,
                width: NODE_SHOW,
              },
            ]}
          />
        </TimelineTrack>
        <ScaledPressable
          onPress={() => onOpenShow(firstShow)}
          style={styles.chapterCard}
        >
          <LinearGradient
            colors={theme.linearGradientColors}
            end={theme.linearGradientEnd}
            start={theme.linearGradientStart}
            style={styles.chapterGradient}
          >
            <Text style={styles.chapterEmoji}>🎤</Text>
            <Text style={styles.chapterKicker}>Where it all started</Text>
            <Text numberOfLines={3} style={styles.chapterArtistVenue}>
              {firstShow.artist}
              {'\n'}
              {firstShow.venue}
              {firstShow.city ? ` · ${firstShow.city}` : ''}
            </Text>
          </LinearGradient>
        </ScaledPressable>
      </View>

      {yearGroups.map((yg, yi) => {
        const isLastYear = yi === yearGroups.length - 1;
        return (
          <View key={yg.year}>
            <View style={[styles.row, styles.yearHeaderPad]}>
              <View style={styles.yearGutterCenter}>
                <Text style={styles.yearLabelBesideLine}>{yg.year}</Text>
              </View>
              <TimelineTrack>
                <YearMarkerOnLine year={yg.year} />
              </TimelineTrack>
              <View style={styles.yearHeaderRightSpacer} />
            </View>

            {yg.shows.map((show) => (
              <View key={show.id} style={styles.row}>
                <View style={styles.gutter} />
                <TimelineTrack>
                  <View
                    style={[
                      styles.showDot,
                      {
                        borderRadius: NODE_SHOW / 2,
                        height: NODE_SHOW,
                        width: NODE_SHOW,
                      },
                    ]}
                  />
                </TimelineTrack>
                <ShowTimelineCard
                  onPress={() => onOpenShow(show)}
                  show={show}
                />
              </View>
            ))}

            {!isLastYear ? (
              <View style={styles.row}>
                <View style={styles.gutter} />
                <TimelineTrack>
                  <View style={styles.summaryStub} />
                </TimelineTrack>
                <Text style={styles.summaryText}>
                  You saw {yg.showCount}{' '}
                  {yg.showCount === 1 ? 'show' : 'shows'} in {yg.year} across{' '}
                  {yg.cityCount} {yg.cityCount === 1 ? 'city' : 'cities'}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={[styles.row, styles.footerRow]}>
        <View style={styles.gutter} />
        <TimelineTrack>
          <PulsingEndDot />
        </TimelineTrack>
        <Text style={styles.footerText}>Your story continues...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chapterArtistVenue: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 20,
    lineHeight: 20 * theme.typography.lineHeight.tight,
    marginTop: theme.spacing.sm,
  },
  chapterCard: {
    borderRadius: theme.radius.lg,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    ...theme.rnShadowMd,
  },
  chapterEmoji: {
    fontSize: 28,
    marginBottom: theme.spacing.xs,
  },
  chapterGradient: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  chapterKicker: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * theme.typography.lineHeight.normal,
  },
  footerRow: {
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  footerText: {
    color: MUTED,
    flex: 1,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 14 * theme.typography.lineHeight.relaxed,
  },
  gutter: {
    width: GUTTER,
  },
  journeySubtitle: {
    color: MUTED,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * theme.typography.lineHeight.relaxed,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  journeyTitle: {
    color: INK,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 22,
    lineHeight: 22 * theme.typography.lineHeight.tight,
  },
  pulseDot: {
    backgroundColor: ORANGE,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  row: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  scorePill: {
    alignSelf: 'flex-start',
    backgroundColor: ORANGE,
    borderRadius: theme.radius.full,
    marginTop: 2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  scorePillText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 12,
  },
  section: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  showArtist: {
    color: INK,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: 16,
    lineHeight: 16 * theme.typography.lineHeight.tight,
  },
  showAvatar: {
    height: 52,
    width: 52,
  },
  showCard: {
    alignItems: 'flex-start',
    backgroundColor: theme.card,
    borderRadius: 16,
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  showCardMid: {
    flex: 1,
    minWidth: 0,
  },
  showDate: {
    color: DATE_MUTED,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  showDot: {
    backgroundColor: ORANGE,
  },
  showVenueCity: {
    color: MUTED,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * theme.typography.lineHeight.normal,
    marginTop: 4,
  },
  summaryStub: {
    height: 1,
    width: 1,
  },
  summaryText: {
    color: MUTED,
    flex: 1,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 13 * theme.typography.lineHeight.relaxed,
    paddingTop: theme.spacing.xs,
  },
  timelineEmpty: {
    color: MUTED,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    marginTop: theme.spacing.md,
  },
  trackCol: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: TRACK,
  },
  trackDotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    zIndex: 2,
  },
  trackLine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ORANGE,
    left: LINE_X,
    width: LINE_W,
  },
  yearGutterCenter: {
    justifyContent: 'center',
    width: GUTTER,
  },
  yearHeaderPad: {
    alignItems: 'stretch',
    marginTop: theme.spacing.md,
    minHeight: YEAR_MARKER_D + 8,
  },
  yearHeaderRightSpacer: {
    flex: 1,
  },
  yearLabelBesideLine: {
    color: ORANGE,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 18,
    lineHeight: 18 * theme.typography.lineHeight.tight,
    textAlign: 'right',
  },
  yearNodeCircle: {
    alignItems: 'center',
    backgroundColor: ORANGE,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  yearNodeText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 13,
    lineHeight: 14,
  },
});
