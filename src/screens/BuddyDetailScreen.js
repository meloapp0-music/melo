import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ArtistShowMedia from '../components/ArtistShowMedia';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import ScaledPressable from '../components/ScaledPressable';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';
import {
  aggregateConcertBuddies,
  parseFriendsFromShow,
} from '../utils/aggregateConcertBuddies';

function buddyInitial(name) {
  const t = String(name ?? '').trim();
  if (!t) {
    return '?';
  }
  return t[0].toUpperCase();
}

function formatListDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function SharedShowRow({ show, onPress }) {
  return (
    <ScaledPressable
      onPress={onPress}
      style={[
        styles.showCard,
        {
          borderRadius: theme.radius.myShowsListRow,
          height: theme.layout.myShowsListRowHeight,
        },
      ]}
    >
      <ArtistShowMedia
        artistName={show.artist}
        borderRadius={theme.radius.myShowsGridCard}
        fallbackUri={show.imageUrl}
        initialLetterSize={26}
        style={[
          styles.showImage,
          {
            borderRadius: theme.radius.myShowsGridCard,
            height: theme.layout.myShowsListRowHeight,
            width: theme.layout.myShowsListImage,
          },
        ]}
      />
      <View style={styles.showMain}>
        <View style={styles.showTextCol}>
          <Text numberOfLines={1} style={styles.showArtist}>
            {show.artist}
          </Text>
          <Text numberOfLines={1} style={styles.showVenue}>
            {show.venue}
          </Text>
          <Text numberOfLines={1} style={styles.showDate}>
            {formatListDate(show.date)}
          </Text>
        </View>
      </View>
    </ScaledPressable>
  );
}

export default function BuddyDetailScreen() {
  const scrollBottomPad = useMeloScrollBottomPadding();
  const navigation = useNavigation();
  const route = useRoute();
  const buddyName = route.params?.buddyName ?? '';
  const { attended } = useShows();

  const buddy = useMemo(() => {
    const list = aggregateConcertBuddies(attended);
    return list.find((b) => b.name === buddyName) ?? null;
  }, [attended, buddyName]);

  const showsFallback = useMemo(() => {
    if (buddy) {
      return buddy.shows;
    }
    return attended.filter((s) => parseFriendsFromShow(s).includes(buddyName));
  }, [attended, buddy, buddyName]);

  const openShow = (show) => {
    navigation.navigate('ShowDetail', { show, wishlist: false });
  };

  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      <View style={[styles.topBar, { paddingTop: MELO_BELOW_NOTCH_PADDING }]}>
        <ScaledPressable
          hitSlop={12}
          onPress={() => navigation.goBack()}
          style={styles.backHit}
        >
          <Ionicons
            color={theme.text}
            name="chevron-back"
            size={28}
          />
        </ScaledPressable>
      </View>
      <FlatList
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: scrollBottomPad },
        ]}
        data={showsFallback}
        style={styles.listFlex}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient
              colors={theme.linearGradientColors}
              end={theme.linearGradientEnd}
              start={theme.linearGradientStart}
              style={[
                styles.headerAvatar,
                {
                  borderRadius: theme.layout.buddySpotlightAvatar / 2,
                  height: theme.layout.buddySpotlightAvatar,
                  width: theme.layout.buddySpotlightAvatar,
                },
              ]}
            >
              <Text style={styles.headerInitial}>
                {buddyInitial(buddyName)}
              </Text>
            </LinearGradient>
            <Text numberOfLines={2} style={styles.headerName}>
              {buddyName}
            </Text>
            <Text style={styles.headerSubtitle}>
              {"Shows you've shared"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <SharedShowRow
              show={item}
              onPress={() => openShow(item)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backHit: {
    padding: theme.spacing.xs,
  },
  header: {
    alignItems: 'center',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  headerInitial: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.buddiesSpotlightInitial,
  },
  headerName: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.buddiesSpotlightName,
    lineHeight:
      theme.typography.fontSize.buddiesSpotlightName *
      theme.typography.lineHeight.tight,
    textAlign: 'center',
  },
  headerSubtitle: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.buddiesDetailSubtitle,
    lineHeight:
      theme.typography.fontSize.buddiesDetailSubtitle *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xs,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: theme.spacing.sm,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  listFlex: {
    flex: 1,
  },
  rowWrap: {
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  showArtist: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.myShowsListArtist,
    lineHeight:
      theme.typography.fontSize.myShowsListArtist *
      theme.typography.lineHeight.tight,
  },
  showCard: {
    alignItems: 'center',
    backgroundColor: theme.card,
    flexDirection: 'row',
    overflow: 'hidden',
    ...theme.rnShadowSm,
  },
  showDate: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.myShowsListSub,
    marginTop: theme.spacing.xxs,
  },
  showImage: {
    overflow: 'hidden',
  },
  showMain: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
  },
  showTextCol: {
    flex: 1,
  },
  showVenue: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.myShowsListVenue,
    marginTop: theme.spacing.xxs,
  },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.sm,
  },
});
