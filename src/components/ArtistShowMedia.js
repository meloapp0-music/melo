import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useArtistImage } from '../hooks/useArtistImage';
import theme from '../theme';
import { artistAccentColor, artistInitial } from '../utils/artistAccent';

/**
 * Full-bleed artist image (Deezer → fallback URI → gradient + initial).
 */
export default function ArtistShowMedia({
  artistName,
  borderRadius,
  children,
  fallbackUri,
  initialLetterSize = 44,
  style,
}) {
  const { displayUri, hasPhoto } = useArtistImage(artistName, fallbackUri);
  const accent = artistAccentColor(artistName);

  return (
    <View style={[style, { borderRadius, overflow: 'hidden' }]}>
      {hasPhoto ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          source={{ uri: displayUri }}
          style={[StyleSheet.absoluteFillObject, { borderRadius }]}
          transition={200}
        />
      ) : (
        <LinearGradient
          colors={[theme.amber, accent]}
          end={theme.linearGradientEnd}
          start={theme.linearGradientStart}
          style={[StyleSheet.absoluteFillObject, styles.placeholder]}
        >
          <Text style={[styles.initial, { fontSize: initialLetterSize }]}>
            {artistInitial(artistName)}
          </Text>
        </LinearGradient>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  initial: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displayBold,
    opacity: 0.95,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
