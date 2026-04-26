import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ArtistShowMedia from '../components/ArtistShowMedia';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import EmptyState from '../components/EmptyState';
import LogShowSheet from '../components/LogShowSheet';
import ScaledPressable from '../components/ScaledPressable';
import { ShimmerPlaceholder } from '../components/ShimmerPlaceholder';
import {
  UpcomingEventDetailSheet,
  UpcomingShowsFooter,
} from '../components/UpcomingShowsBlock';
import { useLogSheet } from '../context/LogSheetContext';
import { useShows } from '../context/ShowsContext';
import { useUpcomingFromAttended } from '../hooks/useUpcomingFromAttended';
import {
  useSimulatedInitialLoad,
  useSimulatedRefresh,
} from '../hooks/useSimulatedFeed';
import theme from '../theme';
import {
  buildChipOptions,
  filterShowsByChips,
  filterShowsByQuery,
  SORT_KEYS,
  sortShows,
} from '../utils/myShowsFilter';

const SORT_OPTIONS = [
  { key: SORT_KEYS.recent, label: 'Most recent' },
  { key: SORT_KEYS.rating, label: 'Highest rated' },
  { key: SORT_KEYS.artist, label: 'Artist A–Z' },
  { key: SORT_KEYS.city, label: 'City A–Z' },
];

function formatListDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function FilterChip({ active, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chipHit,
        pressed && styles.chipPressed,
      ]}
    >
      {active ? (
        <LinearGradient
          colors={theme.linearGradientColors}
          end={theme.linearGradientEnd}
          start={theme.linearGradientStart}
          style={styles.chipOn}
        >
          <Text style={styles.chipOnText}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.chipOff}>
          <Text style={styles.chipOffText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function ShareCardInner({ attended, show }) {
  if (!show) {
    return <View style={styles.shareInner} />;
  }
  return (
    <LinearGradient
      colors={theme.linearGradientColors}
      end={theme.linearGradientEnd}
      start={theme.linearGradientStart}
      style={styles.shareInner}
    >
      <Text style={styles.shareBrand}>Melo</Text>
      <Text style={styles.shareArtist}>{show.artist}</Text>
      <Text style={styles.shareVenue}>{show.venue}</Text>
      <Text style={styles.shareMeta}>
        {show.city} · {formatListDate(show.date)}
      </Text>
      {attended && show.score != null ? (
        <View style={[styles.shareScore, { borderRadius: theme.radius.md }]}>
          <Text style={styles.shareScoreText}>{show.score.toFixed(1)}</Text>
        </View>
      ) : (
        <Text style={styles.shareWish}>On my wishlist</Text>
      )}
    </LinearGradient>
  );
}

export default function MyShowsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = useMeloScrollBottomPadding();
  const { onRefresh: baseRefresh, refreshing } = useSimulatedRefresh();
  const listLoad = useSimulatedInitialLoad(400);
  const { openLog } = useLogSheet();
  const { width: winW } = useWindowDimensions();
  const {
    addWishlistFromPayload,
    attended,
    deleteAttended,
    deleteWishlist,
    handleLogSave,
    wishlist,
  } = useShows();

  const [tab, setTab] = useState('attended');
  const noArtists = useMemo(() => [], []);
  const upcomingAttended = tab === 'wishlist' ? attended : noArtists;
  const upcoming = useUpcomingFromAttended(upcomingAttended);
  const [upcomingPick, setUpcomingPick] = useState(null);

  const onRefresh = useCallback(() => {
    baseRefresh();
    if (tab === 'wishlist') {
      upcoming.refetch();
    }
  }, [baseRefresh, tab, upcoming.refetch]);

  const [query, setQuery] = useState('');
  const [activeChips, setActiveChips] = useState(() => new Set());
  const [viewMode, setViewMode] = useState('grid');
  const [sortKey, setSortKey] = useState(SORT_KEYS.recent);
  const [sortOpen, setSortOpen] = useState(false);
  const [ctxShow, setCtxShow] = useState(null);
  const [ctxWishlist, setCtxWishlist] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logEdit, setLogEdit] = useState({
    id: null,
    show: null,
    wishlist: false,
  });
  const [shareTarget, setShareTarget] = useState(null);

  const shareRef = useRef(null);

  const baseList = tab === 'attended' ? attended : wishlist;
  const chipOpts = useMemo(() => buildChipOptions(baseList), [baseList]);

  const filtered = useMemo(() => {
    const q = filterShowsByQuery(baseList, query);
    return filterShowsByChips(q, activeChips);
  }, [baseList, query, activeChips]);

  const sorted = useMemo(
    () => sortShows(filtered, sortKey),
    [filtered, sortKey],
  );

  const { colW, gridGap } = useMemo(() => {
    const hPad = 12;
    const gap = 8;
    const inner = winW - hPad * 2 - gap;
    return { colW: inner / 2, gridGap: gap };
  }, [winW]);

  const listBottomPad = Math.max(120, scrollBottomPad);

  const toggleChip = useCallback((id) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const onAddFromUpcoming = useCallback(
    (ev) => {
      const added = addWishlistFromPayload({
        artist: ev.artist,
        city: ev.city,
        country: ev.country,
        date: ev.datetime,
        notes: ev.description?.slice(0, 800) || '',
        venue: ev.venueName,
      });
      setUpcomingPick(null);
      if (added) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }
      } else {
        Alert.alert(
          'Already on wishlist',
          'This concert is already on your list.',
        );
      }
    },
    [addWishlistFromPayload],
  );

  const wishlistListFooter = useMemo(() => {
    if (tab !== 'wishlist') {
      return null;
    }
    return (
      <UpcomingShowsFooter
        events={upcoming.events}
        loading={upcoming.loading}
        onSelectEvent={setUpcomingPick}
      />
    );
  }, [tab, upcoming.events, upcoming.loading]);

  const openLogEdit = useCallback((show, isWishlist) => {
    setLogEdit({ id: show.id, show, wishlist: isWishlist });
    setLogOpen(true);
    setCtxShow(null);
  }, []);

  const openLogMarkAttended = useCallback((show) => {
    setLogEdit({ id: show.id, show, wishlist: true });
    setLogOpen(true);
  }, []);

  const runShare = useCallback(async (show, attended) => {
    setShareTarget({ attended, show });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 96));
    try {
      const uri = await captureRef(shareRef, {
        format: 'png',
        quality: 0.95,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      console.warn('Share failed', e);
    } finally {
      setShareTarget(null);
    }
    setCtxShow(null);
  }, []);

  const confirmDelete = useCallback(
    (show, isWishlist) => {
      Alert.alert(
        'Delete show',
        `Remove ${show.artist} from your library?`,
        [
          { style: 'cancel', text: 'Cancel' },
          {
            style: 'destructive',
            text: 'Delete',
            onPress: () => {
              if (isWishlist) {
                deleteWishlist(show.id);
              } else {
                deleteAttended(show.id);
              }
            },
          },
        ],
      );
      setCtxShow(null);
    },
    [deleteAttended, deleteWishlist],
  );

  const openContext = useCallback((show, isWishlist) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setCtxShow(show);
    setCtxWishlist(isWishlist);
  }, []);

  const renderGridItem = useCallback(
    ({ item, index }) => {
      const isWish = tab === 'wishlist';
      const isLeftCol = index % 2 === 0;
      const scoreLabel =
        typeof item.score === 'number' && !Number.isNaN(item.score)
          ? item.score.toFixed(1)
          : '—';
      const scoreOrHeart = isWish ? (
        <View
          style={[
            styles.gridWishBadge,
            {
              borderRadius: theme.radius.full,
              elevation: 6,
              zIndex: 10,
            },
          ]}
        >
          <Ionicons color={theme.card} name="heart" size={18} />
        </View>
      ) : (
        <View
          style={[
            styles.gridScore,
            {
              borderRadius: theme.radius.full,
              elevation: 6,
              zIndex: 10,
            },
          ]}
        >
          <Text style={styles.gridScoreText}>{scoreLabel}</Text>
        </View>
      );
      return (
        <ScaledPressable
          onLongPress={() => openContext(item, isWish)}
          onPress={() =>
            navigation.navigate('ShowDetail', {
              show: item,
              wishlist: isWish,
            })
          }
          style={{
            marginBottom: theme.spacing.sm,
            marginRight: isLeftCol ? gridGap : 0,
            width: colW,
          }}
        >
          <ArtistShowMedia
            artistName={item.artist}
            borderRadius={16}
            fallbackUri={item.imageUrl}
            initialLetterSize={Math.round(colW * 0.28)}
            style={[
              styles.gridImage,
              {
                borderRadius: 16,
                height: 200,
                width: colW,
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.2)', 'transparent']}
              end={{ x: 0.5, y: 0.55 }}
              locations={[0, 1]}
              pointerEvents="none"
              start={{ x: 0.5, y: 0 }}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  borderRadius: 16,
                },
              ]}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.1)']}
              end={{ x: 0.5, y: 1 }}
              locations={[0.55, 1]}
              pointerEvents="none"
              start={{ x: 0.5, y: 0 }}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  borderRadius: 16,
                },
              ]}
            />
            <LinearGradient
              colors={theme.overlay.gridCardGradientColors}
              end={{ x: 0.5, y: 1 }}
              locations={theme.overlay.gridCardGradientLocations}
              start={{ x: 0.5, y: 0 }}
              style={[
                styles.gridOverlay,
                { borderRadius: 16 },
              ]}
            >
              <Text numberOfLines={1} style={styles.gridArtist}>
                {item.artist}
              </Text>
            </LinearGradient>
            {scoreOrHeart}
          </ArtistShowMedia>
        </ScaledPressable>
      );
    },
    [colW, gridGap, navigation, openContext, tab],
  );

  const listRowInner = useCallback(
    (item, isWish) => (
      <ScaledPressable
        onLongPress={() => openContext(item, isWish)}
        onPress={() =>
          navigation.navigate('ShowDetail', { show: item, wishlist: isWish })
        }
        style={[
          styles.listCard,
          { borderRadius: theme.radius.myShowsListRow, height: theme.layout.myShowsListRowHeight },
        ]}
      >
        <ArtistShowMedia
          artistName={item.artist}
          borderRadius={theme.radius.myShowsGridCard}
          fallbackUri={item.imageUrl}
          initialLetterSize={28}
          style={[
            styles.listImage,
            {
              borderRadius: theme.radius.myShowsGridCard,
              height: theme.layout.myShowsListRowHeight,
              width: theme.layout.myShowsListImage,
            },
          ]}
        />
        <View style={styles.listMain}>
          <View style={styles.listTextCol}>
            <Text numberOfLines={1} style={styles.listArtist}>
              {item.artist}
            </Text>
            <Text numberOfLines={1} style={styles.listVenue}>
              {item.venue}
            </Text>
            <Text numberOfLines={1} style={styles.listSub}>
              {item.city} · {formatListDate(item.date)}
            </Text>
          </View>
          {isWish ? (
            <Ionicons
              color={theme.primary}
              name="heart"
              size={theme.typography.fontSize.xl}
              style={styles.listHeart}
            />
          ) : (
            <Text style={styles.listScore}>
              {item.score != null ? item.score.toFixed(1) : '—'}
            </Text>
          )}
        </View>
      </ScaledPressable>
    ),
    [navigation, openContext],
  );

  const renderListItem = useCallback(
    ({ item }) => {
      const isWish = tab === 'wishlist';
      const inner = listRowInner(item, isWish);
      if (!isWish) {
        return <View style={styles.listWrap}>{inner}</View>;
      }
      return (
        <View style={styles.listWrap}>
          <Swipeable
            overshootRight={false}
            renderRightActions={() => (
              <ScaledPressable
                onPress={() => openLogMarkAttended(item)}
                style={styles.swipeBtn}
              >
                <Text style={styles.swipeBtnText}>
                  Mark as{'\n'}Attended
                </Text>
              </ScaledPressable>
            )}
          >
            {inner}
          </Swipeable>
        </View>
      );
    },
    [listRowInner, openLogMarkAttended, tab],
  );

  const allChips = useMemo(
    () => [
      ...chipOpts.years,
      ...chipOpts.cities,
      ...chipOpts.genres,
      ...chipOpts.scoreBuckets,
    ],
    [chipOpts],
  );

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      {listLoad ? (
        <View style={styles.listSkeleton}>
          <ShimmerPlaceholder borderRadius={8} height={28} width="55%" />
          <ShimmerPlaceholder borderRadius={theme.radius.searchBar} height={48} style={{ marginTop: theme.spacing.md }} />
          <ShimmerPlaceholder borderRadius={theme.radius.xl} height={180} style={{ marginTop: theme.spacing.lg }} />
        </View>
      ) : (
        <View style={styles.mainFill}>
      <View
        style={[
          styles.headerRow,
          { paddingTop: MELO_BELOW_NOTCH_PADDING },
        ]}
      >
        <Text style={styles.screenTitle}>My Shows</Text>
        <View style={styles.headerActions}>
          <ScaledPressable
            onPress={() =>
              setViewMode((m) => (m === 'grid' ? 'list' : 'grid'))
            }
            style={styles.iconBtn}
          >
            <Ionicons
              color={theme.primary}
              name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
              size={theme.typography.fontSize.lg}
            />
          </ScaledPressable>
          <ScaledPressable
            onPress={() => navigation.navigate('RankHome')}
            style={styles.iconBtn}
          >
            <Ionicons
              color={theme.primary}
              name="trophy-outline"
              size={theme.typography.fontSize.lg}
            />
          </ScaledPressable>
          <ScaledPressable onPress={() => setSortOpen(true)}>
            <Text style={styles.sortBtn}>Sort</Text>
          </ScaledPressable>
        </View>
      </View>

      <View style={styles.searchShell}>
        <Ionicons
          color={theme.primary}
          name="search"
          size={theme.typography.fontSize.md}
          style={styles.searchIcon}
        />
        <TextInput
          onChangeText={setQuery}
          placeholder="Search artists, venues, cities"
          placeholderTextColor={theme.muted}
          style={styles.searchInput}
          value={query}
        />
      </View>

      <View style={styles.tabRow}>
        <ScaledPressable
          onPress={() => setTab('attended')}
          style={styles.tabHit}
        >
          {tab === 'attended' ? (
            <LinearGradient
              colors={theme.linearGradientColors}
              end={theme.linearGradientEnd}
              start={theme.linearGradientStart}
              style={styles.tabOn}
            >
              <Text style={styles.tabOnText}>Attended</Text>
            </LinearGradient>
          ) : (
            <View style={styles.tabOff}>
              <Text style={styles.tabOffText}>Attended</Text>
            </View>
          )}
        </ScaledPressable>
        <ScaledPressable
          onPress={() => setTab('wishlist')}
          style={styles.tabHit}
        >
          {tab === 'wishlist' ? (
            <LinearGradient
              colors={theme.linearGradientColors}
              end={theme.linearGradientEnd}
              start={theme.linearGradientStart}
              style={styles.tabOn}
            >
              <Text style={styles.tabOnText}>Wishlist</Text>
            </LinearGradient>
          ) : (
            <View style={styles.tabOff}>
              <Text style={styles.tabOffText}>Wishlist</Text>
            </View>
          )}
        </ScaledPressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.chipsScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScrollView}
      >
        {tab === 'attended'
          ? allChips.map((c) => (
              <FilterChip
                key={c.id}
                active={activeChips.has(c.id)}
                label={c.label}
                onPress={() => toggleChip(c.id)}
              />
            ))
          : chipOpts.years
              .concat(chipOpts.cities)
              .concat(chipOpts.genres)
              .map((c) => (
                <FilterChip
                  key={c.id}
                  active={activeChips.has(c.id)}
                  label={c.label}
                  onPress={() => toggleChip(c.id)}
                />
              ))}
      </ScrollView>

      {viewMode === 'grid' ? (
        <FlatList
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.listContent,
            sorted.length === 0 ? styles.listContentEmpty : null,
            {
              paddingBottom: listBottomPad,
              paddingTop: sorted.length > 0 ? 12 : 0,
            },
          ]}
          data={sorted}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              ctaLabel={
                tab === 'wishlist' ? 'Browse Home' : 'Log a show'
              }
              emoji={tab === 'wishlist' ? '💜' : '🎤'}
              message={
                tab === 'wishlist'
                  ? 'Wishlist is empty'
                  : 'No shows match filters'
              }
              onCtaPress={
                tab === 'wishlist'
                  ? () =>
                      navigation.getParent()?.navigate('HomeTab', {
                        screen: 'Home',
                      })
                  : openLog
              }
              subtitle={
                tab === 'wishlist'
                  ? 'Save shows you want to see.'
                  : 'Try clearing search or chips, or add a new show.'
              }
            />
          }
          numColumns={2}
          refreshControl={
            <RefreshControl
              onRefresh={onRefresh}
              refreshing={refreshing}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={wishlistListFooter}
          renderItem={renderGridItem}
          showsVerticalScrollIndicator={false}
          style={styles.listFlex}
        />
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            sorted.length === 0 ? styles.listContentEmpty : null,
            {
              paddingBottom: listBottomPad,
              paddingTop: sorted.length > 0 ? 12 : 0,
            },
          ]}
          data={sorted}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              ctaLabel={
                tab === 'wishlist' ? 'Browse Home' : 'Log a show'
              }
              emoji={tab === 'wishlist' ? '💜' : '🎤'}
              message={
                tab === 'wishlist'
                  ? 'Wishlist is empty'
                  : 'No shows match filters'
              }
              onCtaPress={
                tab === 'wishlist'
                  ? () =>
                      navigation.getParent()?.navigate('HomeTab', {
                        screen: 'Home',
                      })
                  : openLog
              }
              subtitle={
                tab === 'wishlist'
                  ? 'Save artists you want to catch live.'
                  : 'Adjust filters or log your next gig.'
              }
            />
          }
          refreshControl={
            <RefreshControl
              onRefresh={onRefresh}
              refreshing={refreshing}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={wishlistListFooter}
          renderItem={renderListItem}
          showsVerticalScrollIndicator={false}
          style={styles.listFlex}
        />
      )}
        </View>
      )}

      <UpcomingEventDetailSheet
        event={upcomingPick}
        onAddWishlist={onAddFromUpcoming}
        onClose={() => setUpcomingPick(null)}
        visible={Boolean(upcomingPick)}
      />

      <Modal animationType="fade" transparent visible={sortOpen}>
        <View style={styles.modalRoot}>
          <ScaledPressable
            contentStyle={[
              styles.sheetBackdrop,
              { backgroundColor: theme.backdrop },
            ]}
            onPress={() => setSortOpen(false)}
          >
            <View />
          </ScaledPressable>
          <View
            style={[
              styles.sortSheet,
              { paddingBottom: insets.bottom + theme.spacing.md },
            ]}
          >
            {SORT_OPTIONS.map((o) => (
              <ScaledPressable
                key={o.key}
                onPress={() => {
                  setSortKey(o.key);
                  setSortOpen(false);
                }}
                style={styles.sortRow}
              >
                <Text style={styles.sortRowText}>{o.label}</Text>
              </ScaledPressable>
            ))}
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={!!ctxShow}>
        <View style={styles.modalRoot}>
          <ScaledPressable
            contentStyle={[
              styles.sheetBackdrop,
              { backgroundColor: theme.backdrop },
            ]}
            onPress={() => setCtxShow(null)}
          >
            <View />
          </ScaledPressable>
          <View
            style={[
              styles.ctxSheet,
              { paddingBottom: insets.bottom + theme.spacing.md },
            ]}
          >
            <ScaledPressable
              onPress={() => ctxShow && openLogEdit(ctxShow, ctxWishlist)}
              style={styles.ctxRow}
            >
              <Text style={styles.ctxRowText}>Edit show</Text>
            </ScaledPressable>
            <ScaledPressable
              onPress={() => ctxShow && runShare(ctxShow, !ctxWishlist)}
              style={styles.ctxRow}
            >
              <Text style={styles.ctxRowText}>Share</Text>
            </ScaledPressable>
            <ScaledPressable
              onPress={() => ctxShow && confirmDelete(ctxShow, ctxWishlist)}
              style={styles.ctxRow}
            >
              <Text style={styles.ctxDelete}>Delete</Text>
            </ScaledPressable>
          </View>
        </View>
      </Modal>

      <LogShowSheet
        editingId={logEdit.id}
        initialShow={logEdit.show}
        onClose={() => {
          setLogOpen(false);
          setLogEdit({ id: null, show: null, wishlist: false });
        }}
        onSave={handleLogSave}
        visible={logOpen}
        wishlistEdit={logEdit.wishlist}
      />

      <View
        collapsable={false}
        pointerEvents="none"
        ref={shareRef}
        style={styles.shareCapture}
      >
        <ShareCardInner
          attended={shareTarget?.attended}
          show={shareTarget?.show}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listSkeleton: {
    flex: 1,
    padding: theme.spacing.md,
  },
  chipHit: {
    marginRight: theme.spacing.sm,
  },
  chipOff: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipOffText: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.filterChip,
    includeFontPadding: false,
    lineHeight:
      theme.typography.fontSize.filterChip *
      theme.typography.lineHeight.normal,
  },
  chipOn: {
    alignItems: 'center',
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipOnText: {
    color: '#FFFFFF',
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.filterChip,
    includeFontPadding: false,
    lineHeight:
      theme.typography.fontSize.filterChip *
      theme.typography.lineHeight.normal,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chipPressed: {
    opacity: 0.88,
  },
  chipsScroll: {
    flexDirection: 'row',
    paddingBottom: 0,
    paddingHorizontal: 12,
  },
  chipsScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  ctxDelete: {
    color: theme.error,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    paddingVertical: theme.spacing.md,
    textAlign: 'center',
  },
  ctxRow: {
    borderBottomColor: theme.borderLight,
    borderBottomWidth: 1,
    paddingVertical: theme.spacing.md,
  },
  ctxRowText: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    textAlign: 'center',
  },
  ctxSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.logSheetTop,
    borderTopRightRadius: theme.radius.logSheetTop,
    paddingTop: theme.spacing.md,
    ...theme.rnShadowLg,
  },
  gridArtist: {
    bottom: theme.spacing.sm,
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.showCardArtist,
    left: theme.spacing.sm,
    position: 'absolute',
    right: theme.spacing.sm,
  },
  gridImage: {
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  gridRow: {
    justifyContent: 'flex-start',
  },
  gridScore: {
    backgroundColor: theme.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    position: 'absolute',
    right: theme.spacing.xs,
    top: theme.spacing.xs,
  },
  gridWishBadge: {
    alignItems: 'center',
    backgroundColor: theme.primary,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: theme.spacing.xs,
    top: theme.spacing.xs,
    width: 36,
  },
  gridScoreText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.showCardScore,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  iconBtn: {
    padding: theme.spacing.xs,
  },
  listArtist: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.myShowsListArtist,
    lineHeight:
      theme.typography.fontSize.myShowsListArtist *
      theme.typography.lineHeight.tight,
  },
  listCard: {
    alignItems: 'center',
    backgroundColor: theme.card,
    flexDirection: 'row',
    overflow: 'hidden',
    ...theme.rnShadowSm,
  },
  listContent: {
    paddingHorizontal: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listFlex: {
    flex: 1,
  },
  mainFill: {
    flex: 1,
  },
  listHeart: {
    marginLeft: theme.spacing.sm,
  },
  listImage: {
    overflow: 'hidden',
  },
  listMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
  },
  listScore: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.myShowsListScore,
    marginLeft: theme.spacing.sm,
  },
  listSub: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.myShowsListSub,
    marginTop: theme.spacing.xxs,
  },
  listTextCol: {
    flex: 1,
  },
  listVenue: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.myShowsListVenue,
    marginTop: theme.spacing.xxs,
  },
  listWrap: {
    marginBottom: theme.spacing.sm,
  },
  modalRoot: {
    flex: 1,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  screenTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.myShowsTitle,
    letterSpacing: theme.typography.letterSpacing.myShowsTitle,
    lineHeight:
      theme.typography.fontSize.myShowsTitle *
      theme.typography.lineHeight.tight,
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
    borderRadius: theme.radius.searchBar,
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  shareArtist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.xl,
    marginTop: theme.spacing.lg,
  },
  shareBrand: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.sm,
    letterSpacing: theme.typography.letterSpacing.fieldUppercase,
    opacity: 0.95,
    textTransform: 'uppercase',
  },
  shareCapture: {
    aspectRatio: 9 / 16,
    left: -2000,
    opacity: 0.99,
    position: 'absolute',
    top: -2000,
    width: 360,
  },
  shareInner: {
    borderRadius: theme.radius.lg,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: theme.spacing.xl,
  },
  shareMeta: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.md,
  },
  shareScore: {
    alignSelf: 'flex-start',
    backgroundColor: theme.card,
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  shareScoreText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.title,
  },
  shareVenue: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.xs,
  },
  shareWish: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.xl,
  },
  sheetBackdrop: {
    flex: 1,
  },
  sortBtn: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.sortAction,
    lineHeight:
      theme.typography.fontSize.sortAction * theme.typography.lineHeight.normal,
  },
  sortRow: {
    borderBottomColor: theme.borderLight,
    borderBottomWidth: 1,
    paddingVertical: theme.spacing.md,
  },
  sortRowText: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    textAlign: 'center',
  },
  sortSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.logSheetTop,
    borderTopRightRadius: theme.radius.logSheetTop,
    paddingTop: theme.spacing.md,
    ...theme.rnShadowLg,
  },
  swipeBtn: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    height: theme.layout.myShowsListRowHeight,
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  swipeBtnText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
  },
  tabHit: {
    flex: 1,
  },
  tabOff: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.full,
    marginHorizontal: theme.spacing.xxs,
    paddingVertical: theme.spacing.sm,
  },
  tabOffText: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.tabLabel,
  },
  tabOn: {
    alignItems: 'center',
    borderRadius: theme.radius.full,
    marginHorizontal: theme.spacing.xxs,
    paddingVertical: theme.spacing.sm,
  },
  tabOnText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.tabLabel,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 0,
    paddingHorizontal: theme.spacing.md,
  },
});
