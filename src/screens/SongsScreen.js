import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import ScaledPressable from '../components/ScaledPressable';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';
import {
  aggregateLiveSongs,
  countShowsWithSetlists,
  filterSongsByQuery,
  SONG_SORT,
  sortSongs,
} from '../utils/aggregateLiveSongs';

const SORT_OPTIONS = [
  { key: SONG_SORT.mostSeen, label: 'Most Seen' },
  { key: SONG_SORT.recent, label: 'Recently Heard' },
  { key: SONG_SORT.artistAZ, label: 'Artist A-Z' },
];

function truncateVenue(name, max = 14) {
  const t = (name || '').trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

function uniqueVenues(entry) {
  const set = new Set();
  for (const o of entry.occurrences) {
    const v = (o.venue || '').trim();
    if (v) {
      set.add(v);
    }
  }
  return [...set];
}

function SongStatCard({ color, label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statNumber, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SongTrackingRow({ entry, onOpenShow, showCountBadge }) {
  const venues = uniqueVenues(entry);
  const showId = entry.occurrences?.[0]?.showId;
  return (
    <ScaledPressable
      onPress={() => onOpenShow?.(showId)}
      style={styles.songCard}
    >
      <View style={styles.songAvatarSlot}>
        <Ionicons color={theme.primary} name="musical-notes" size={22} />
      </View>
      <View style={styles.songMain}>
        <Text numberOfLines={2} style={styles.songTitle}>
          {entry.title}
        </Text>
        <Text numberOfLines={1} style={styles.songArtist}>
          {entry.artist}
        </Text>
        {venues.length > 0 ? (
          <View style={styles.venueRow}>
            {venues.map((v) => (
              <View
                key={v}
                style={[
                  styles.venueChip,
                  { borderRadius: theme.radius.full },
                ]}
              >
                <Text numberOfLines={1} style={styles.venueChipText}>
                  {truncateVenue(v)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {showCountBadge ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{entry.count}x</Text>
        </View>
      ) : null}
    </ScaledPressable>
  );
}

export default function SongsScreen() {
  const navigation = useNavigation();
  const scrollBottomPad = useMeloScrollBottomPadding();
  const { attended } = useShows();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState(SONG_SORT.mostSeen);

  const aggregated = useMemo(
    () => aggregateLiveSongs(attended),
    [attended],
  );

  const filtered = useMemo(
    () => filterSongsByQuery(aggregated, query),
    [aggregated, query],
  );

  const showsWithSetlists = useMemo(
    () => countShowsWithSetlists(attended),
    [attended],
  );

  const totalHeardLive = useMemo(
    () => aggregated.reduce((sum, e) => sum + e.count, 0),
    [aggregated],
  );

  const uniqueSongs = aggregated.length;
  const heard2xPlus = useMemo(
    () => aggregated.filter((e) => e.count >= 2).length,
    [aggregated],
  );

  const multiSorted = useMemo(
    () => sortSongs(
      filtered.filter((e) => e.count > 1),
      sortKey,
    ),
    [filtered, sortKey],
  );

  const onceSorted = useMemo(
    () => sortSongs(
      filtered.filter((e) => e.count === 1),
      sortKey,
    ),
    [filtered, sortKey],
  );

  const sections = useMemo(() => {
    const out = [];
    if (multiSorted.length > 0) {
      out.push({
        data: multiSorted,
        key: 'multi',
        title: 'Heard Multiple Times',
      });
    }
    if (onceSorted.length > 0) {
      out.push({
        data: onceSorted,
        key: 'once',
        title: 'All Songs',
      });
    }
    return out;
  }, [multiSorted, onceSorted]);

  const hasSongs = aggregated.length > 0;
  const showNoSearchResults = hasSongs && filtered.length === 0 && query.trim();
  const openShowDetail = (showId) => {
    if (!showId) {
      return;
    }
    const show = attended.find((row) => row.id === showId);
    if (!show) {
      return;
    }
    navigation.navigate('ShowDetail', { show, wishlist: false });
  };

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      <SectionList
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: scrollBottomPad },
        ]}
        keyExtractor={(item) => item.key}
        style={styles.listFlex}
        ListEmptyComponent={showNoSearchResults ? <Text style={styles.noResultsText}>No songs match your search</Text> : null}
        ListHeaderComponent={
          <>
            <View
              style={[
                styles.headerBlock,
                { paddingTop: MELO_BELOW_NOTCH_PADDING },
              ]}
            >
              <Text style={styles.screenTitle}>Song Tracking</Text>
              <Text style={styles.screenSubtitle}>
                Every song you&apos;ve ever heard live
              </Text>
            </View>
            <View style={styles.statRow}>
              <SongStatCard color={theme.primary} label="Heard Live" value={totalHeardLive} />
              <View style={styles.statGap} />
              <SongStatCard color={theme.amber} label="Unique Songs" value={uniqueSongs} />
              <View style={styles.statGap} />
              <SongStatCard color={theme.songTracking.statPurple} label="Heard 2x+" value={heard2xPlus} />
            </View>

            <View style={styles.searchShell}>
              <Ionicons color={theme.muted} name="search" size={18} style={styles.searchIcon} />
              <TextInput
                onChangeText={setQuery}
                placeholder="Search songs or artists"
                placeholderTextColor={theme.muted}
                style={styles.searchInput}
                value={query}
              />
            </View>

            <View style={styles.sortRow}>
              {SORT_OPTIONS.map((opt) => {
                const on = sortKey === opt.key;
                return (
                  <ScaledPressable
                    key={opt.key}
                    onPress={() => setSortKey(opt.key)}
                    style={[styles.sortChip, on && styles.sortChipOn]}
                  >
                    <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>
                      {opt.label}
                    </Text>
                  </ScaledPressable>
                );
              })}
            </View>

            <Text style={styles.totalLine}>
              {uniqueSongs} songs heard across {showsWithSetlists} shows
            </Text>
            {!hasSongs ? <Text style={styles.noResultsText}>No songs yet. Add setlists when you log shows.</Text> : null}
          </>
        }
        renderItem={({ item, section }) => (
          <View style={styles.rowWrap}>
            <SongTrackingRow
              entry={item}
              onOpenShow={openShowDetail}
              showCountBadge={section.key === 'multi'}
            />
          </View>
        )}
        renderSectionHeader={({ section: sec }) => (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
          </View>
        )}
        sections={hasSongs && !showNoSearchResults ? sections : []}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  countBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.songTracking.badgePurpleBg,
    borderRadius: 12,
    marginLeft: theme.spacing.sm,
    minWidth: 40,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  countBadgeText: {
    color: theme.songTracking.statPurple,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.songCountBadge,
    lineHeight:
      theme.typography.fontSize.songCountBadge *
      theme.typography.lineHeight.tight,
    textAlign: 'center',
  },
  headerBlock: {
    paddingHorizontal: theme.spacing.md,
  },
  listContent: {
    flexGrow: 1,
  },
  listFlex: {
    flex: 1,
  },
  noResultsText: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    textAlign: 'center',
  },
  root: {
    backgroundColor: '#FAF8F5',
    flex: 1,
  },
  rowWrap: {
    marginBottom: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
  },
  screenSubtitle: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    lineHeight:
      14 * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xs,
  },
  screenTitle: {
    color: theme.songTracking.ink,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 28,
    lineHeight:
      28 * theme.typography.lineHeight.tight,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    color: theme.text,
    flex: 1,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.searchInput,
    lineHeight:
      theme.typography.fontSize.searchInput *
      theme.typography.lineHeight.normal,
    paddingVertical: theme.spacing.sm,
  },
  searchShell: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  sectionHead: {
    marginBottom: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    color: theme.songTracking.ink,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.songTrackingSection,
    lineHeight:
      theme.typography.fontSize.songTrackingSection *
      theme.typography.lineHeight.tight,
  },
  songArtist: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.songRowArtist,
    lineHeight:
      theme.typography.fontSize.songRowArtist *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  songAvatarSlot: {
    alignItems: 'center',
    backgroundColor: '#FDF0EC',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    marginRight: theme.spacing.md,
    width: 44,
  },
  songCard: {
    alignItems: 'flex-start',
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    flexDirection: 'row',
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  songMain: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    color: theme.songTracking.ink,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.songRowTitle,
    lineHeight:
      theme.typography.fontSize.songRowTitle *
      theme.typography.lineHeight.normal,
  },
  sortChip: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 4,
    minWidth: 0,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  sortChipOn: {
    borderColor: theme.primary,
  },
  sortChipText: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.songSortChip,
    lineHeight:
      theme.typography.fontSize.songSortChip *
      theme.typography.lineHeight.normal,
    textAlign: 'center',
  },
  sortChipTextOn: {
    color: theme.primary,
  },
  sortRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    flex: 1,
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  statLabel: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.songStatLabel,
    lineHeight:
      theme.typography.fontSize.songStatLabel *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  statNumber: {
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 28,
    lineHeight:
      28 * theme.typography.lineHeight.tight,
    textAlign: 'center',
  },
  statGap: {
    width: theme.spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
  },
  totalLine: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.songTotalMeta,
    lineHeight:
      theme.typography.fontSize.songTotalMeta *
      theme.typography.lineHeight.normal,
    marginBottom: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
  },
  venueChip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.songTracking.venuePillBg,
    marginRight: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
  },
  venueChipText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.songVenueChip,
    lineHeight:
      theme.typography.fontSize.songVenueChip *
      theme.typography.lineHeight.tight,
  },
  venueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xxs,
  },
});
