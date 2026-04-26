import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../theme';
import ArtistShowMedia from './ArtistShowMedia';

function formatScore(s) {
  return typeof s === 'number' ? s.toFixed(1) : String(s);
}

export default function ShowCard({ show }) {
  const w = theme.layout.showCardWidth;
  const h = theme.layout.showCardHeight;
  return (
    <ArtistShowMedia
      artistName={show.artist}
      borderRadius={theme.radius.xl}
      fallbackUri={show.imageUrl}
      initialLetterSize={36}
      style={[styles.card, { borderRadius: theme.radius.xl, height: h, width: w }]}
    >
      <LinearGradient
        colors={theme.overlay.imageCardBottom65Colors}
        end={{ x: 0.5, y: 1 }}
        locations={theme.overlay.imageCardBottom65Locations}
        start={{ x: 0.5, y: 0 }}
        style={[styles.overlay, { borderRadius: theme.radius.xl }]}
      >
        <View style={styles.bottom}>
          <Text numberOfLines={1} style={styles.artist}>
            {show.artist}
          </Text>
          <Text numberOfLines={1} style={styles.venue}>
            {show.venue}
          </Text>
        </View>
      </LinearGradient>
      <View style={[styles.badge, { borderRadius: theme.radius.full }]}>
        <Text style={styles.badgeText}>{formatScore(show.score)}</Text>
      </View>
    </ArtistShowMedia>
  );
}

const styles = StyleSheet.create({
  artist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.showCardArtist,
    lineHeight:
      theme.typography.fontSize.showCardArtist *
      theme.typography.lineHeight.tight,
  },
  badge: {
    backgroundColor: theme.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    position: 'absolute',
    right: theme.spacing.xs,
    top: theme.spacing.xs,
  },
  badgeText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.showCardScore,
    lineHeight:
      theme.typography.fontSize.showCardScore *
      theme.typography.lineHeight.tight,
  },
  bottom: {
    bottom: 0,
    left: 0,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    position: 'absolute',
    right: 0,
  },
  card: {
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  venue: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.showCardVenue,
    lineHeight:
      theme.typography.fontSize.showCardVenue *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
});
