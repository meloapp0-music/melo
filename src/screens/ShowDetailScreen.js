import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { fetchArtistBioSummary } from '../api/musicbrainz';
import { fetchDeezerArtistPicture } from '../api/deezer';
import ScaledPressable from '../components/ScaledPressable';
import { useLogSheet } from '../context/LogSheetContext';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';

const HERO_MIN_H = 280;
const ABOUT_COLOR = '#78716C';

function formatLongDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return String(iso ?? '');
  }
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  });
}

function friendInitial(name) {
  const t = String(name ?? '').trim();
  if (!t) {
    return '?';
  }
  return t[0].toUpperCase();
}

function InfoRow({ children, icon }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons
        color={theme.primary}
        name={icon}
        size={20}
        style={styles.infoIcon}
      />
      <View style={styles.infoTextCol}>{children}</View>
    </View>
  );
}

export default function ShowDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const { openLogEdit } = useLogSheet();
  const { attended, wishlist } = useShows();
  const { show, wishlist: routeWishlist } = route.params ?? {};

  const [heroUri, setHeroUri] = useState(null);
  const [heroLoading, setHeroLoading] = useState(true);
  const [aboutText, setAboutText] = useState(null);
  const [aboutLoading, setAboutLoading] = useState(true);

  const resolvedShow = useMemo(() => {
    if (!show?.id) {
      return show;
    }
    const a = attended.find((s) => s.id === show.id);
    if (a) {
      return a;
    }
    const w = wishlist.find((s) => s.id === show.id);
    if (w) {
      return w;
    }
    return show;
  }, [attended, wishlist, show]);

  const isWishlist = Boolean(routeWishlist);

  useEffect(() => {
    const hasPhotos =
      Array.isArray(resolvedShow?.photos) && resolvedShow.photos.length > 0;
    if (hasPhotos) {
      setHeroUri(null);
      setHeroLoading(false);
      return undefined;
    }
    if (!resolvedShow?.artist) {
      setHeroLoading(false);
      return undefined;
    }
    const ac = new AbortController();
    setHeroLoading(true);
    fetchDeezerArtistPicture(resolvedShow.artist, ac.signal)
      .then((uri) => {
        setHeroUri(uri || resolvedShow.imageUrl || null);
      })
      .catch(() => {
        setHeroUri(resolvedShow.imageUrl || null);
      })
      .finally(() => setHeroLoading(false));
    return () => ac.abort();
  }, [resolvedShow?.artist, resolvedShow?.imageUrl, resolvedShow?.photos]);

  useEffect(() => {
    if (!resolvedShow?.artist) {
      setAboutLoading(false);
      return undefined;
    }
    const ac = new AbortController();
    setAboutLoading(true);
    fetchArtistBioSummary(resolvedShow.artist, ac.signal)
      .then((t) => setAboutText(t))
      .catch(() => setAboutText(null))
      .finally(() => setAboutLoading(false));
    return () => ac.abort();
  }, [resolvedShow?.artist]);

  const heroHeight = useMemo(
    () => Math.min(Math.max(winH * 0.38, HERO_MIN_H), 420),
    [winH],
  );

  const onEdit = useCallback(() => {
    if (!resolvedShow) {
      return;
    }
    const inA = attended.find((s) => s.id === resolvedShow.id);
    const inW = wishlist.find((s) => s.id === resolvedShow.id);
    if (inA) {
      openLogEdit({ id: inA.id, show: inA, wishlist: false });
    } else if (inW) {
      openLogEdit({ id: inW.id, show: inW, wishlist: true });
    } else {
      openLogEdit({ id: null, show: resolvedShow, wishlist: false });
    }
  }, [attended, openLogEdit, resolvedShow, wishlist]);

  if (!resolvedShow) {
    return null;
  }

  const supportList = Array.isArray(resolvedShow.supportActs)
    ? resolvedShow.supportActs.filter(Boolean)
    : [];
  const friendsList = Array.isArray(resolvedShow.friends)
    ? resolvedShow.friends.filter(Boolean)
    : [];
  const setlist = Array.isArray(resolvedShow.setlist)
    ? resolvedShow.setlist.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const displayUri = heroUri || resolvedShow.imageUrl;
  const photoUris = Array.isArray(resolvedShow.photos)
    ? resolvedShow.photos.filter(Boolean)
    : [];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(120, insets.bottom + theme.spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollFlex}
      >
        <View style={[styles.heroWrap, { height: heroHeight }]}>
          {photoUris.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={StyleSheet.absoluteFillObject}
            >
              {photoUris.map((uri) => (
                <Image
                  key={uri}
                  contentFit="cover"
                  source={{ uri }}
                  style={{ height: heroHeight, width: winW }}
                  transition={200}
                />
              ))}
            </ScrollView>
          ) : displayUri ? (
            <Image
              contentFit="cover"
              source={{ uri: displayUri }}
              style={StyleSheet.absoluteFillObject}
              transition={200}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: theme.surface },
              ]}
            />
          )}
          {heroLoading && photoUris.length === 0 ? (
            <View style={styles.heroLoading}>
              <ActivityIndicator color={theme.card} />
            </View>
          ) : null}
          <LinearGradient
            colors={theme.overlay.detailHeroGradientColors}
            end={{ x: 0.5, y: 1 }}
            locations={theme.overlay.detailHeroGradientLocations}
            start={{ x: 0.5, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.heroChrome,
              { paddingTop: insets.top + theme.spacing.xs },
            ]}
          >
            <ScaledPressable
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={() => navigation.goBack()}
              style={styles.roundIconBtn}
            >
              <Ionicons color={theme.card} name="chevron-back" size={26} />
            </ScaledPressable>
          </View>
          <View
            pointerEvents="box-none"
            style={[
              styles.heroRightStack,
              { top: insets.top + theme.spacing.xs },
            ]}
          >
            <ScaledPressable hitSlop={8} onPress={onEdit} style={styles.editPill}>
              <Text style={styles.editPillText}>Edit</Text>
            </ScaledPressable>
            {!isWishlist && resolvedShow.score != null ? (
              <View style={styles.scorePillHero}>
                <Text style={styles.scorePillHeroText}>
                  {resolvedShow.score.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.heroTitleBlock, { paddingBottom: insets.bottom > 0 ? theme.spacing.md : theme.spacing.lg }]}>
            <Text style={styles.heroArtist}>{resolvedShow.artist}</Text>
          </View>
        </View>

        <View style={styles.whiteCard}>
          <InfoRow icon="location-sharp">
            <Text style={styles.infoLabel}>Venue</Text>
            <Text style={styles.infoValue}>{resolvedShow.venue || '—'}</Text>
          </InfoRow>
          <InfoRow icon="business-outline">
            <Text style={styles.infoLabel}>City</Text>
            <Text style={styles.infoValue}>{resolvedShow.city || '—'}</Text>
          </InfoRow>
          <InfoRow icon="calendar-outline">
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>
              {formatLongDate(resolvedShow.date)}
            </Text>
          </InfoRow>
          {supportList.length > 0 ? (
            <InfoRow icon="mic-outline">
              <Text style={styles.infoLabel}>Support</Text>
              <Text style={styles.infoValue}>{supportList.join(', ')}</Text>
            </InfoRow>
          ) : null}
        </View>

        <Text style={styles.sectionHeading}>Setlist</Text>
        {setlist.length === 0 ? (
          <Text style={styles.emptyLine}>No setlist saved for this show.</Text>
        ) : (
          <View style={styles.setlistCard}>
            {setlist.map((title, i) => (
              <View key={`${i}-${title}`} style={styles.setlistRow}>
                <Text style={styles.setlistNum}>{i + 1}.</Text>
                <Ionicons
                  color={theme.primary}
                  name="musical-note"
                  size={18}
                  style={styles.setlistNote}
                />
                <Text style={styles.setlistTitle}>{title}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionHeading}>Friends There</Text>
        {friendsList.length === 0 ? (
          <Text style={styles.emptyLine}>No friends tagged.</Text>
        ) : (
          <View style={styles.friendsRow}>
            {friendsList.map((name) => (
              <LinearGradient
                key={name}
                colors={theme.linearGradientColors}
                end={theme.linearGradientEnd}
                start={theme.linearGradientStart}
                style={styles.friendCircle}
              >
                <Text style={styles.friendInitial}>{friendInitial(name)}</Text>
              </LinearGradient>
            ))}
          </View>
        )}

        <Text style={styles.sectionHeading}>Show Notes</Text>
        {resolvedShow.notes?.trim() ? (
          <Text style={styles.notesBody}>{resolvedShow.notes.trim()}</Text>
        ) : (
          <Text style={styles.emptyLine}>No notes for this show.</Text>
        )}

        <Text style={styles.sectionHeading}>About This Tour</Text>
        {aboutLoading ? (
          <ActivityIndicator color={theme.primary} style={styles.aboutSpinner} />
        ) : aboutText ? (
          <Text style={styles.aboutBody}>{aboutText}</Text>
        ) : (
          <Text style={styles.emptyLine}>
            No biography found for this artist.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  aboutBody: {
    color: ABOUT_COLOR,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * theme.typography.lineHeight.relaxed,
    marginHorizontal: theme.spacing.md,
  },
  aboutSpinner: {
    marginVertical: theme.spacing.sm,
  },
  editPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  editPillText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
  },
  emptyLine: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.normal,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  friendCircle: {
    alignItems: 'center',
    borderRadius: theme.radius.full,
    height: 48,
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    width: 48,
  },
  friendInitial: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.md,
  },
  friendsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
  },
  heroArtist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 28,
    lineHeight: 28 * theme.typography.lineHeight.tight,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroChrome: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    left: 0,
    paddingHorizontal: theme.spacing.sm,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  heroRightStack: {
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    position: 'absolute',
    right: theme.spacing.md,
    zIndex: 3,
  },
  heroLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  heroTitleBlock: {
    bottom: 0,
    left: 0,
    paddingHorizontal: theme.spacing.md,
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
  heroWrap: {
    backgroundColor: theme.text,
    position: 'relative',
    width: '100%',
  },
  infoIcon: {
    marginTop: 2,
  },
  infoLabel: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 12,
    letterSpacing: theme.typography.letterSpacing.fieldUppercase * 0.5,
    textTransform: 'uppercase',
  },
  infoRow: {
    borderBottomColor: theme.borderLight,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: theme.spacing.md,
  },
  infoTextCol: {
    flex: 1,
  },
  infoValue: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.md,
    lineHeight:
      theme.typography.fontSize.md * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  notesBody: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.relaxed,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  roundIconBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: theme.radius.full,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  scorePillHero: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  scorePillHeroText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.statNumber,
  },
  sectionHeading: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.md,
    letterSpacing: theme.typography.letterSpacing.fieldUppercase,
    marginBottom: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    textTransform: 'uppercase',
  },
  setlistCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.rnShadowSm,
  },
  setlistNote: {
    marginRight: theme.spacing.sm,
  },
  setlistNum: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.bodyMedium,
    fontSize: 15,
    marginRight: theme.spacing.xs,
    minWidth: 28,
  },
  setlistRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
  },
  setlistTitle: {
    color: theme.text,
    flex: 1,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 15,
    lineHeight: 15 * theme.typography.lineHeight.normal,
  },
  whiteCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    ...theme.rnShadowSm,
  },
});
