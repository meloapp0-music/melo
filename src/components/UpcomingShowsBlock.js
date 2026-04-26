import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArtistShowMedia from './ArtistShowMedia';
import ScaledPressable from './ScaledPressable';
import { ShimmerPlaceholder } from './ShimmerPlaceholder';
import theme from '../theme';

const CARD_W = 156;
const CARD_H = 208;
const INK = '#1C1917';
const META_LIGHT = 'rgba(255,255,255,0.88)';

function formatPillDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatDetailDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  });
}

function formatDetailTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UpcomingShowsFooter({ events, loading, onSelectEvent }) {
  return (
    <View style={styles.footerBlock}>
      <Text style={styles.comingUpTitle}>Coming Up</Text>
      {loading ? (
        <ScrollView
          contentContainerStyle={styles.upcomingStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {[0, 1, 2].map((i) => (
            <ShimmerPlaceholder
              borderRadius={theme.radius.lg}
              height={CARD_H}
              key={i}
              style={styles.shimmerCard}
              width={CARD_W}
            />
          ))}
        </ScrollView>
      ) : events.length === 0 ? (
        <Text style={styles.upcomingEmpty}>No upcoming shows found</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.upcomingStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {events.map((ev) => (
            <ScaledPressable
              key={ev.id}
              onPress={() => onSelectEvent(ev)}
              style={styles.upcomingCardHit}
            >
              <ArtistShowMedia
                artistName={ev.artist}
                borderRadius={theme.radius.lg}
                style={styles.upcomingCardMedia}
              >
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.82)']}
                  end={{ x: 0.5, y: 1 }}
                  locations={[0.4, 1]}
                  pointerEvents="none"
                  start={{ x: 0.5, y: 0 }}
                  style={[StyleSheet.absoluteFillObject, { borderRadius: theme.radius.lg }]}
                />
                <View style={styles.datePill}>
                  <Text style={styles.datePillText}>{formatPillDate(ev.datetime)}</Text>
                </View>
                <View style={styles.upcomingCardTextBlock}>
                  <Text numberOfLines={2} style={styles.upcomingArtist}>
                    {ev.artist}
                  </Text>
                  <Text numberOfLines={1} style={styles.upcomingVenue}>
                    {ev.venueName}
                  </Text>
                  <Text numberOfLines={1} style={styles.upcomingCity}>
                    {ev.city}
                    {ev.region ? `, ${ev.region}` : ''}
                  </Text>
                </View>
              </ArtistShowMedia>
            </ScaledPressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function UpcomingEventDetailSheet({
  event,
  onAddWishlist,
  onClose,
  visible,
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const maxH = Math.min(winH * 0.78, 560);

  if (!event) {
    return null;
  }

  const lineupText = (event.lineup || [])
    .map((l) => l.name)
    .filter(Boolean)
    .join(' · ');

  const openTickets = () => {
    const u = event.ticketUrl;
    if (u && u.startsWith('http')) {
      Linking.openURL(u);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.sheetModalRoot}>
        <ScaledPressable
          contentStyle={[
            styles.sheetBackdrop,
            { backgroundColor: theme.backdrop },
          ]}
          onPress={onClose}
        >
          <View />
        </ScaledPressable>
        <View
          style={[
            styles.upcomingSheet,
            {
              maxHeight: maxH,
              paddingBottom: insets.bottom + theme.spacing.md,
            },
          ]}
        >
          <View style={styles.sheetHandleWrap}>
            <View style={styles.sheetHandle} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={[styles.sheetScroll, { maxHeight: maxH - 200 }]}
          >
            <View style={styles.sheetHero}>
              <ArtistShowMedia
                artistName={event.artist}
                borderRadius={theme.radius.md}
                style={styles.sheetHeroImg}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.75)']}
                end={{ x: 0.5, y: 1 }}
                locations={[0.35, 1]}
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { borderRadius: theme.radius.md }]}
              />
              <Text numberOfLines={2} style={styles.sheetHeroArtist}>
                {event.artist}
              </Text>
            </View>

            <Text style={styles.sheetDate}>{formatDetailDate(event.datetime)}</Text>
            <Text style={styles.sheetTime}>{formatDetailTime(event.datetime)}</Text>

            <View style={styles.sheetRow}>
              <Ionicons color={theme.subtext} name="location-outline" size={18} />
              <View style={styles.sheetRowText}>
                <Text style={styles.sheetVenue}>{event.venueName || 'Venue TBA'}</Text>
                <Text style={styles.sheetCity}>
                  {[event.city, event.region, event.country].filter(Boolean).join(', ')}
                </Text>
              </View>
            </View>

            {lineupText ? (
              <Text style={styles.sheetLineup}>
                <Text style={styles.sheetLineupLabel}>Lineup · </Text>
                {lineupText}
              </Text>
            ) : null}

            {event.title ? (
              <Text style={styles.sheetTitle}>{event.title}</Text>
            ) : null}

            {event.description ? (
              <Text style={styles.sheetDesc}>{event.description}</Text>
            ) : null}
          </ScrollView>

          <View style={styles.sheetActions}>
            <ScaledPressable onPress={() => onAddWishlist?.(event)}>
              <LinearGradient
                colors={theme.linearGradientColors}
                end={theme.linearGradientEnd}
                start={theme.linearGradientStart}
                style={styles.sheetBtnPrimary}
              >
                <Text style={styles.sheetBtnPrimaryText}>Add to Wishlist</Text>
              </LinearGradient>
            </ScaledPressable>
            <ScaledPressable
              disabled={!event.ticketUrl}
              onPress={openTickets}
              style={[
                styles.sheetBtnSecondary,
                !event.ticketUrl && styles.sheetBtnSecondaryDisabled,
              ]}
            >
              <Text style={styles.sheetBtnSecondaryText}>Get Tickets</Text>
            </ScaledPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  comingUpTitle: {
    color: INK,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: 18,
    lineHeight: 18 * theme.typography.lineHeight.tight,
    marginBottom: theme.spacing.md,
  },
  datePill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.primary,
    borderRadius: theme.radius.full,
    left: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    position: 'absolute',
    top: theme.spacing.sm,
  },
  datePillText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 12,
  },
  footerBlock: {
    paddingBottom: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
  },
  sheetActions: {
    borderTopColor: theme.borderLight,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetBtnPrimary: {
    alignItems: 'center',
    borderRadius: theme.radius.saveButton,
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    ...theme.rnShadowMd,
  },
  sheetBtnPrimaryText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.saveCta,
  },
  sheetBtnSecondary: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.primary,
    borderRadius: theme.radius.saveButton,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
  },
  sheetBtnSecondaryDisabled: {
    opacity: 0.45,
  },
  sheetBtnSecondaryText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.saveCta,
  },
  sheetCity: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xxs,
  },
  sheetDate: {
    color: INK,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.md,
  },
  sheetDesc: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: theme.border,
    borderRadius: 2,
    height: 4,
    width: 36,
  },
  sheetHandleWrap: {
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  sheetHero: {
    borderRadius: theme.radius.md,
    height: 160,
    overflow: 'hidden',
    position: 'relative',
  },
  sheetHeroArtist: {
    bottom: theme.spacing.md,
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: 20,
    left: theme.spacing.md,
    position: 'absolute',
    right: theme.spacing.md,
  },
  sheetHeroImg: {
    borderRadius: theme.radius.md,
    height: 160,
    width: '100%',
  },
  sheetLineup: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    lineHeight:
      theme.typography.fontSize.sm * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.md,
  },
  sheetLineupLabel: {
    fontFamily: theme.typography.fontFamily.bodySemiBold,
  },
  sheetModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  sheetRowText: {
    flex: 1,
  },
  sheetScroll: {
    paddingHorizontal: theme.spacing.md,
  },
  sheetTime: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xxs,
  },
  sheetTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.sm,
  },
  sheetVenue: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  upcomingSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.logSheetTop,
    borderTopRightRadius: theme.radius.logSheetTop,
    ...theme.rnShadowLg,
  },
  upcomingArtist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: 16,
    lineHeight: 16 * theme.typography.lineHeight.tight,
    marginBottom: theme.spacing.xxs,
  },
  upcomingCardHit: {
    marginRight: theme.spacing.sm,
  },
  upcomingCardMedia: {
    borderRadius: theme.radius.lg,
    height: CARD_H,
    width: CARD_W,
  },
  upcomingCardTextBlock: {
    bottom: 0,
    left: 0,
    padding: theme.spacing.sm,
    position: 'absolute',
    right: 0,
  },
  upcomingCity: {
    color: META_LIGHT,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * theme.typography.lineHeight.normal,
    marginTop: 2,
  },
  upcomingEmpty: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * theme.typography.lineHeight.normal,
  },
  upcomingStrip: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.xs,
    paddingRight: theme.spacing.md,
  },
  upcomingVenue: {
    color: META_LIGHT,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * theme.typography.lineHeight.normal,
  },
  shimmerCard: {
    marginRight: theme.spacing.sm,
  },
});
