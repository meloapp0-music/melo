import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScaledPressable from '../components/ScaledPressable';
import { VerticalBarChart } from '../components/SimpleCharts';
import { VIBE_LABELS } from '../constants/vibes';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';
import { buildYearReview } from '../utils/yearReviewStats';

const REVIEW_YEAR = 2025;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function YearInReviewScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { attended } = useShows();
  const shareRef = useRef(null);
  const chartW = Math.min(width - theme.spacing.md * 2, 360);

  const stats = useMemo(
    () => buildYearReview(attended, REVIEW_YEAR),
    [attended],
  );

  const monthBars = useMemo(
    () =>
      stats.monthCounts.map((n, i) => ({
        label: MONTHS[i],
        value: n,
      })),
    [stats.monthCounts],
  );

  const vibeSummary = useMemo(() => {
    if (!stats.topVibe) {
      return 'Log vibes on your shows to see your year in sound.';
    }
    const label = VIBE_LABELS[stats.topVibe] || stats.topVibe;
    return `Your most-tagged vibe was “${label}” (${stats.topVibeCount} shows).`;
  }, [stats.topVibe, stats.topVibeCount]);

  const shareCard = useCallback(async () => {
    await new Promise((r) => requestAnimationFrame(r));
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 0.95 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      console.warn('Share failed', e);
    }
  }, []);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + theme.spacing.xxl, paddingTop: insets.top + theme.spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScaledPressable hitSlop={12} onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </ScaledPressable>
        <Text style={styles.headline}>Your {REVIEW_YEAR} in Music</Text>
        <Text style={styles.lead}>A snapshot of your live year.</Text>

        <View collapsable={false} ref={shareRef} style={styles.shareCard}>
          <LinearGradient
            colors={theme.linearGradientColors}
            end={theme.linearGradientEnd}
            start={theme.linearGradientStart}
            style={styles.shareGrad}
          >
            <Text style={styles.shareBrand}>Melo</Text>
            <Text style={styles.shareYear}>{REVIEW_YEAR} Year in Review</Text>
            <Text style={styles.shareBig}>{stats.totalShows} shows</Text>
            <Text style={styles.shareLine}>
              Top artist · {stats.topArtist ?? '—'}
            </Text>
            <Text style={styles.shareLine}>
              Top venue · {stats.topVenue ?? '—'}
            </Text>
            <Text style={styles.shareLine}>
              Avg score ·{' '}
              {stats.avgScore != null ? stats.avgScore.toFixed(1) : '—'}
            </Text>
          </LinearGradient>
        </View>

        <View style={styles.card}>
          <Text style={styles.statHuge}>{stats.totalShows}</Text>
          <Text style={styles.statLabel}>Shows this year</Text>
        </View>

        <View style={styles.row2}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.statMid} numberOfLines={2}>
              {stats.topArtist ?? '—'}
            </Text>
            <Text style={styles.statLabel}>Top artist</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.statMid} numberOfLines={2}>
              {stats.topVenue ?? '—'}
            </Text>
            <Text style={styles.statLabel}>Top venue</Text>
          </View>
        </View>

        <View style={styles.row2}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.statMid} numberOfLines={2}>
              {stats.topCity ?? '—'}
            </Text>
            <Text style={styles.statLabel}>Top city</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.statMid}>
              {stats.avgScore != null ? stats.avgScore.toFixed(1) : '—'}
            </Text>
            <Text style={styles.statLabel}>Average score</Text>
          </View>
        </View>

        <Text style={styles.section}>Shows by month</Text>
        <View style={styles.chartCard}>
          <VerticalBarChart
            data={monthBars}
            height={200}
            width={chartW}
          />
        </View>

        <Text style={styles.section}>Your vibe</Text>
        <View style={styles.card}>
          <Text style={styles.body}>{vibeSummary}</Text>
        </View>

        <ScaledPressable onPress={shareCard} style={styles.shareBtn}>
          <LinearGradient
            colors={theme.linearGradientColors}
            end={theme.linearGradientEnd}
            start={theme.linearGradientStart}
            style={styles.shareBtnGrad}
          >
            <Text style={styles.shareBtnText}>Share</Text>
          </LinearGradient>
        </ScaledPressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  body: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.relaxed,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  chartCard: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    ...theme.rnShadowSm,
  },
  half: {
    flex: 1,
    marginHorizontal: theme.spacing.xs,
  },
  headline: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.title,
    marginBottom: theme.spacing.xs,
  },
  lead: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    marginBottom: theme.spacing.lg,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  row2: {
    flexDirection: 'row',
    marginHorizontal: -theme.spacing.xs,
  },
  scroll: {
    paddingHorizontal: theme.spacing.md,
  },
  section: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.md,
    letterSpacing: theme.typography.letterSpacing.fieldUppercase,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.md,
    textTransform: 'uppercase',
  },
  shareBig: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 28,
    marginTop: theme.spacing.md,
  },
  shareBrand: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: 12,
    letterSpacing: 1,
    opacity: 0.95,
    textTransform: 'uppercase',
  },
  shareBtn: {
    alignSelf: 'center',
    borderRadius: theme.radius.saveButton,
    marginTop: theme.spacing.lg,
    overflow: 'hidden',
  },
  shareBtnGrad: {
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.md,
  },
  shareBtnText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.saveCta,
    textAlign: 'center',
  },
  shareCard: {
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
  },
  shareGrad: {
    padding: theme.spacing.xl,
  },
  shareLine: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.sm,
    opacity: 0.95,
  },
  shareYear: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.lg,
    marginTop: theme.spacing.sm,
  },
  statHuge: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 44,
    lineHeight: 48,
  },
  statLabel: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xs,
  },
  statMid: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.lg,
  },
});
