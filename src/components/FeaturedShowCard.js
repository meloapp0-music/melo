import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../theme';
import ArtistShowMedia from './ArtistShowMedia';

export default function FeaturedShowCard({ show }) {
  const h = theme.layout.featuredCardHeight;
  return (
    <ArtistShowMedia
      artistName={show.artist}
      borderRadius={theme.radius.xl}
      fallbackUri={show.imageUrl}
      initialLetterSize={48}
      style={[styles.card, { borderRadius: theme.radius.xl, height: h }]}
    >
      <LinearGradient
        colors={theme.overlay.imageCardBottom65Colors}
        end={{ x: 0.5, y: 1 }}
        locations={theme.overlay.imageCardBottom65Locations}
        start={{ x: 0.5, y: 0 }}
        style={[styles.overlay, { borderRadius: theme.radius.xl }]}
      >
        <View style={styles.bottom}>
          <Text style={styles.artist}>{show.artist}</Text>
          <Text style={styles.venue}>{show.venue}</Text>
          <Text style={styles.date}>{show.date}</Text>
        </View>
      </LinearGradient>
      <View style={[styles.badge, { borderRadius: theme.radius.md }]}>
        <Text style={styles.badgeText}>
          {typeof show.score === 'number' ? show.score.toFixed(1) : show.score}
        </Text>
      </View>
    </ArtistShowMedia>
  );
}

const styles = StyleSheet.create({
  artist: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.featuredArtist,
    lineHeight:
      theme.typography.fontSize.featuredArtist *
      theme.typography.lineHeight.tight,
  },
  badge: {
    backgroundColor: theme.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
  },
  badgeText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.statNumber,
    lineHeight:
      theme.typography.fontSize.statNumber * theme.typography.lineHeight.tight,
  },
  bottom: {
    bottom: 0,
    left: 0,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  card: {
    overflow: 'hidden',
    width: '100%',
  },
  date: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.featuredMeta,
    lineHeight:
      theme.typography.fontSize.featuredMeta *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xs,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  venue: {
    color: theme.overlay.venueOnImage,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.featuredMeta,
    lineHeight:
      theme.typography.fontSize.featuredMeta *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
});
