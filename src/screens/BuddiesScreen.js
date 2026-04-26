import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ArtistShowMedia from '../components/ArtistShowMedia';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import { useNavigation } from '@react-navigation/native';
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
import {
  aggregateConcertBuddies,
  filterBuddiesByName,
} from '../utils/aggregateConcertBuddies';

function buddyInitial(name) {
  const t = String(name ?? '').trim();
  if (!t) {
    return '?';
  }
  return t[0].toUpperCase();
}

function TopBuddySpotlight({ buddy, onPress }) {
  return (
    <ScaledPressable onPress={() => onPress?.(buddy)}>
      <LinearGradient
        colors={['#F4A261', '#E8573A']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[
          styles.spotlightDrama,
          { borderRadius: theme.radius.buddySpotlight },
        ]}
      >
        <View style={styles.spotlightCircle}>
          <Text style={styles.spotlightCircleLetter}>
            {buddyInitial(buddy.name)}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.spotlightDramaName}>
          {buddy.name}
        </Text>
        <Text style={styles.spotlightDramaTag}>
          Your most frequent concert buddy
        </Text>
        <View style={styles.spotlightWhitePill}>
          <Text style={styles.spotlightWhitePillText}>
            {buddy.showCount}{' '}
            {buddy.showCount === 1 ? 'show' : 'shows'} together
          </Text>
        </View>
      </LinearGradient>
    </ScaledPressable>
  );
}

function BuddyRow({ buddy, onPress, onPressShow }) {
  return (
    <ScaledPressable
      onPress={() => onPress(buddy)}
      style={[
        styles.buddyCard,
        {
          borderRadius: theme.radius.buddyCard,
        },
      ]}
    >
      <View style={styles.buddyRowTop}>
        <LinearGradient
          colors={theme.linearGradientColors}
          end={theme.linearGradientEnd}
          start={theme.linearGradientStart}
          style={[
            styles.rowAvatar,
            {
              borderRadius: theme.layout.buddyRowAvatar / 2,
              height: theme.layout.buddyRowAvatar,
              width: theme.layout.buddyRowAvatar,
            },
          ]}
        >
          <Text style={styles.rowInitial}>{buddyInitial(buddy.name)}</Text>
        </LinearGradient>
        <View style={styles.buddyTextCol}>
          <Text numberOfLines={1} style={styles.rowName}>
            {buddy.name}
          </Text>
          <Text style={styles.rowMeta}>
            {buddy.showCount}{' '}
            {buddy.showCount === 1 ? 'show' : 'shows'} together
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={styles.thumbStrip}
        showsHorizontalScrollIndicator={false}
      >
        {buddy.shows.map((s) => (
          <ScaledPressable
            key={s.id}
            onPress={() => onPressShow?.(s)}
            style={styles.thumbHit}
          >
            <ArtistShowMedia
              artistName={s.artist}
              borderRadius={theme.layout.buddyThumb / 2}
              fallbackUri={s.imageUrl}
              initialLetterSize={12}
              style={[
                styles.thumb,
                {
                  borderRadius: theme.layout.buddyThumb / 2,
                  height: theme.layout.buddyThumb,
                  width: theme.layout.buddyThumb,
                },
              ]}
            />
          </ScaledPressable>
        ))}
      </ScrollView>
    </ScaledPressable>
  );
}

export default function BuddiesScreen() {
  const scrollBottomPad = useMeloScrollBottomPadding();
  const navigation = useNavigation();
  const { onRefresh, refreshing } = useSimulatedRefresh();
  const buddiesLoad = useSimulatedInitialLoad(400);
  const { openLog } = useLogSheet();
  const { attended } = useShows();
  const [query, setQuery] = useState('');

  const allBuddies = useMemo(
    () => aggregateConcertBuddies(attended),
    [attended],
  );

  const filtered = useMemo(
    () => filterBuddiesByName(allBuddies, query),
    [allBuddies, query],
  );

  const showSpotlight = allBuddies.length > 0 && !query.trim();
  const topBuddy = showSpotlight ? allBuddies[0] : null;
  const listData = filtered;

  const openBuddy = (buddy) => {
    navigation.navigate('BuddyDetail', { buddyName: buddy.name });
  };

  if (allBuddies.length === 0) {
    return (
      <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
        <ScrollView
          contentContainerStyle={[
            styles.emptyScrollContent,
            { paddingBottom: scrollBottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.listFlex}
        >
          <View
            style={[
              styles.headerBlock,
              { paddingTop: MELO_BELOW_NOTCH_PADDING },
            ]}
          >
            <Text style={styles.screenTitle}>Buddies</Text>
          </View>
          <EmptyState
            ctaLabel="Log a show"
            emoji="👥"
            message="No concert crew yet"
            onCtaPress={openLog}
            subtitle="Add friends when logging shows to see your concert crew here."
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      <FlatList
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: scrollBottomPad },
        ]}
        data={listData}
        style={styles.listFlex}
        keyExtractor={(item) => item.name}
        ListHeaderComponent={
          <>
            <View
              style={[
                styles.headerBlock,
                { paddingTop: MELO_BELOW_NOTCH_PADDING },
              ]}
            >
              <Text style={styles.screenTitle}>Buddies</Text>
            </View>
            {buddiesLoad ? (
              <View style={styles.buddiesSkeleton}>
                <ShimmerPlaceholder borderRadius={theme.radius.buddySpotlight} height={160} />
                <ShimmerPlaceholder borderRadius={theme.radius.searchBar} height={44} style={{ marginTop: theme.spacing.md, marginHorizontal: theme.spacing.md }} />
              </View>
            ) : null}
            {!buddiesLoad && topBuddy ? (
              <TopBuddySpotlight buddy={topBuddy} onPress={openBuddy} />
            ) : null}
            {!buddiesLoad ? (
            <View style={styles.searchShell}>
              <Ionicons
                color={theme.primary}
                name="search"
                size={theme.typography.fontSize.md}
                style={styles.searchIcon}
              />
              <TextInput
                onChangeText={setQuery}
                placeholder="Search buddies"
                placeholderTextColor={theme.muted}
                style={styles.searchInput}
                value={query}
              />
            </View>
            ) : null}
          </>
        }
        refreshControl={
          <RefreshControl
            onRefresh={onRefresh}
            refreshing={refreshing}
            tintColor={theme.primary}
          />
        }
        renderItem={({ item }) => (
          <BuddyRow
            buddy={item}
            onPress={openBuddy}
            onPressShow={(show) =>
              navigation.navigate('ShowDetail', { show, wishlist: false })
            }
          />
        )}
        ListEmptyComponent={
          query.trim() && filtered.length === 0 ? (
            <EmptyState
              emoji="🔎"
              message="No buddies match your search"
              subtitle="Try another name or clear the search box."
            />
          ) : null
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: theme.spacing.sm }} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  buddiesSkeleton: {
    marginBottom: theme.spacing.sm,
  },
  buddyCard: {
    backgroundColor: theme.card,
    padding: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  buddyRowTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  buddyTextCol: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  emptyArt: {
    alignItems: 'center',
    height: 140,
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
    width: '100%',
  },
  emptyCircleLg: {
    backgroundColor: theme.borderLight,
    borderRadius: 52,
    height: 104,
    opacity: 0.9,
    position: 'absolute',
    width: 104,
  },
  emptyCircleSm: {
    backgroundColor: theme.surface,
    borderRadius: 36,
    height: 72,
    position: 'absolute',
    right: '22%',
    top: 8,
    width: 72,
  },
  emptyCta: {
    borderColor: theme.primary,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  emptyCtaText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  emptyIcon: {
    opacity: 0.9,
  },
  emptyMessage: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.buddiesEmptyBody,
    lineHeight:
      theme.typography.fontSize.buddiesEmptyBody *
      theme.typography.lineHeight.relaxed,
    paddingHorizontal: theme.spacing.xl,
    textAlign: 'center',
  },
  emptyNotes: {
    bottom: 28,
    position: 'absolute',
    right: '28%',
  },
  emptyScrollContent: {
    flexGrow: 1,
  },
  emptyWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  headerBlock: {
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  rowAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInitial: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.buddiesRowInitial,
  },
  rowMeta: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.buddiesMeta,
    lineHeight:
      theme.typography.fontSize.buddiesMeta *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  rowName: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.buddiesRowName,
    lineHeight:
      theme.typography.fontSize.buddiesRowName *
      theme.typography.lineHeight.tight,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  listFlex: {
    flex: 1,
  },
  screenTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.buddiesScreenTitle,
    letterSpacing: theme.typography.letterSpacing.myShowsTitle,
    lineHeight:
      theme.typography.fontSize.buddiesScreenTitle *
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
  searchEmpty: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    textAlign: 'center',
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
  spotlightCircle: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    width: 88,
    ...theme.rnShadowMd,
  },
  spotlightCircleLetter: {
    color: '#E8573A',
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: 36,
    lineHeight: 40,
  },
  spotlightDrama: {
    alignItems: 'center',
    elevation: 8,
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
    shadowColor: '#8B2500',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  spotlightDramaName: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.buddiesSpotlightName,
    lineHeight:
      theme.typography.fontSize.buddiesSpotlightName *
      theme.typography.lineHeight.tight,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  spotlightDramaTag: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.buddiesMeta,
    textAlign: 'center',
  },
  spotlightWhitePill: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.full,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  spotlightWhitePillText: {
    color: '#E8573A',
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.buddiesMeta,
  },
  thumb: {
    overflow: 'hidden',
  },
  thumbHit: {
    marginRight: theme.spacing.xs,
  },
  thumbStrip: {
    marginTop: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
});
