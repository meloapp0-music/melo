import { StyleSheet, View } from 'react-native';
import ArtistShowMedia from './ArtistShowMedia';

/** Circular artist thumbnail for rows and lists. */
export default function ArtistAvatar({
  artistName,
  borderRadius,
  fallbackUri,
  size = 44,
  style,
}) {
  const r = borderRadius ?? size / 2;
  return (
    <View style={style}>
      <ArtistShowMedia
        artistName={artistName}
        borderRadius={r}
        fallbackUri={fallbackUri}
        initialLetterSize={Math.round(size * 0.38)}
        style={{ height: size, width: size }}
      />
    </View>
  );
}
