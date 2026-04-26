import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScaledPressable from '../components/ScaledPressable';
import { LineTrendChart, VerticalBarChart } from '../components/SimpleCharts';
import { DEFAULT_HOME_LAT_LNG } from '../constants/homeBase';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';
import { buildDeepStats } from '../utils/statsAnalytics';

const MONTH_NAMES = [
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

export default function StatsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { attended } = useShows();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const chartW = Math.min(width - theme.spacing.md * 2, 360);

  const load = useCallback(async () => {
    const ac = new AbortController();
    setLoading(true);
    try {
      const d = await buildDeepStats(
        attended,
        DEFAULT_HOME_LAT_LNG,
        ac.signal,
      );
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [attended]);

  useEffect(() => {
    load();
  }, [load]);

  const barData = useMemo(() => {
    if (!data?.showsPerYear) {
      return [];
    }
    return data.showsPerYear.map((r) => ({
      label: String(r.year),
      value: r.count,
    }));
  }, [data]);

  const lineData = useMemo(() => {
    if (!data?.avgScorePerYear) {
      return [];
    }
    return data.avgScorePerYear
      .filter((r) => r.avg != null)
      .map((r) => ({ x: String(r.year), y: r.avg }));
  }, [data]);

  const busiestMonth = useMemo(() => {
    if (!data?.monthCounts) {
      return '—';
    }
    let best = 0;
    let bestN = -1;
    data.monthCounts.forEach((n, i) => {
      if (n > bestN) {
        bestN = n;
        best = i;
      }
    });
    return bestN >= 0 ? MONTH_NAMES[best] : '—';
  }, [data]);

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
        <Text style={styles.title}>Concert analytics</Text>
        <Text style={styles.sub}>
          Deeper stats from every show you’ve logged.
        </Text>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.spin} />
        ) : !data ? (
          <Text style={styles.muted}>Could not load stats.</Text>
        ) : (
          <>
            <Text style={styles.section}>Shows per year</Text>
            <View style={styles.chartCard}>
              <VerticalBarChart
                data={barData}
                height={220}
                width={chartW}
              />
            </View>

            <Text style={styles.section}>Average score per year</Text>
            <View style={styles.chartCard}>
              <LineTrendChart
                data={lineData}
                height={200}
                width={chartW}
              />
            </View>

            <Text style={styles.section}>Top 5 artists</Text>
            <View style={styles.card}>
              {data.artistTop5.map((r, i) => (
                <Text key={r.name} style={styles.rankRow}>
                  {i + 1}. {r.name} — {r.count}
                </Text>
              ))}
            </View>

            <Text style={styles.section}>Top 5 venues</Text>
            <View style={styles.card}>
              {data.venueTop5.map((r, i) => (
                <Text key={r.name} style={styles.rankRow}>
                  {i + 1}. {r.name} — {r.count}
                </Text>
              ))}
            </View>

            <Text style={styles.section}>Top 5 cities</Text>
            <View style={styles.card}>
              {data.cityTop5.map((r, i) => (
                <Text key={r.name} style={styles.rankRow}>
                  {i + 1}. {r.name} — {r.count}
                </Text>
              ))}
            </View>

            <Text style={styles.section}>Busiest month (all time)</Text>
            <View style={styles.card}>
              <Text style={styles.big}>{busiestMonth}</Text>
              <Text style={styles.muted}>Most shows in a single month</Text>
            </View>

            <Text style={styles.section}>Estimated travel</Text>
            <View style={styles.card}>
              <Text style={styles.big}>
                {Math.round(data.totalKm)} km
              </Text>
              <Text style={styles.muted}>
                Straight-line distance from home (NYC) to each unique city
                you’ve seen a show in.
              </Text>
            </View>
          </>
        )}
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
  big: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.title,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
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
  muted: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.relaxed,
  },
  rankRow: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    marginBottom: theme.spacing.xs,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
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
    marginTop: theme.spacing.sm,
    textTransform: 'uppercase',
  },
  spin: {
    marginVertical: theme.spacing.xl,
  },
  sub: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.subtitle,
    marginBottom: theme.spacing.lg,
  },
  title: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.myShowsTitle,
  },
});
