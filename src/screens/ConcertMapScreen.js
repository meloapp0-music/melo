import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ArtistShowMedia from '../components/ArtistShowMedia';
import ScaledPressable from '../components/ScaledPressable';
import { MELO_BELOW_NOTCH_PADDING } from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import { geocodeCity } from '../utils/cityGeocode';
import { useShows } from '../context/ShowsContext';
import theme from '../theme';

let MapView;
let Marker;
if (Platform.OS !== 'web') {
  const M = require('react-native-maps');
  MapView = M.default;
  Marker = M.Marker;
}

function formatListDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ConcertMapScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = useMeloScrollBottomPadding();
  const navigation = useNavigation();
  const { attended } = useShows();
  const mapRef = useRef(null);
  const [coordsByKey, setCoordsByKey] = useState({});
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [sheetCity, setSheetCity] = useState(null);

  const cityGroups = useMemo(() => {
    const map = new Map();
    for (const s of attended) {
      const city = (s.city || '').trim();
      if (!city) {
        continue;
      }
      const key = `${city}|${(s.country || '').trim()}`;
      if (!map.has(key)) {
        map.set(key, { city, country: s.country || '', key, shows: [] });
      }
      map.get(key).shows.push(s);
    }
    return [...map.values()];
  }, [attended]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingGeo(true);
      const next = {};
      for (const g of cityGroups) {
        if (cancelled) {
          break;
        }
        try {
          const loc = await geocodeCity(g.city, g.country);
          if (loc) {
            next[g.key] = loc;
          }
        } catch {
          /* skip */
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      if (!cancelled) {
        setCoordsByKey(next);
      }
      setLoadingGeo(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cityGroups]);

  const markers = useMemo(
    () =>
      cityGroups
        .map((g) => {
          const c = coordsByKey[g.key];
          if (!c) {
            return null;
          }
          return { ...g, latitude: c.lat, longitude: c.lng };
        })
        .filter(Boolean),
    [cityGroups, coordsByKey],
  );

  useEffect(() => {
    if (!mapRef.current || markers.length === 0 || loadingGeo) {
      return;
    }
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        markers.map((m) => ({
          latitude: m.latitude,
          longitude: m.longitude,
        })),
        {
          animated: true,
          edgePadding: {
            bottom: 120,
            left: 48,
            right: 48,
            top: 100,
          },
        },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [markers, loadingGeo]);

  const initialRegion = useMemo(() => {
    if (markers.length === 0) {
      return {
        latitude: 39.8283,
        longitude: -98.5795,
        latitudeDelta: 50,
        longitudeDelta: 50,
      };
    }
    const lats = markers.map((m) => m.latitude);
    const lngs = markers.map((m) => m.longitude);
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 12,
      longitudeDelta: 12,
    };
  }, [markers]);

  const openSheet = useCallback((g) => {
    setSheetCity(g);
  }, []);

  const closeSheet = useCallback(() => setSheetCity(null), []);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + MELO_BELOW_NOTCH_PADDING }]}>
        <Text style={styles.title}>Concert Map</Text>
        <Text style={styles.sub}>
          {cityGroups.length} cities · {attended.length} shows
        </Text>
      </View>

      {Platform.OS === 'web' ? (
        <View style={styles.webFallback}>
          <Ionicons color={theme.muted} name="map-outline" size={48} />
          <Text style={styles.webText}>Map is available on iOS and Android.</Text>
        </View>
      ) : loadingGeo && markers.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <MapView
          initialRegion={initialRegion}
          ref={mapRef}
          style={styles.map}
          showsUserLocation={false}
        >
          {markers.map((m) => (
            <Marker
              anchor={{ x: 0.5, y: 0.5 }}
              coordinate={{
                latitude: m.latitude,
                longitude: m.longitude,
              }}
              key={m.key}
              onPress={() => openSheet(m)}
              tracksViewChanges={false}
            >
              <View style={styles.orangePin} />
            </Marker>
          ))}
        </MapView>
      )}

      <Modal
        animationType="slide"
        onRequestClose={closeSheet}
        transparent
        visible={!!sheetCity}
      >
        <View style={styles.modalRoot}>
          <Pressable
            onPress={closeSheet}
            style={styles.sheetBackdrop}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: scrollBottomPad, paddingTop: theme.spacing.md },
            ]}
          >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{sheetCity?.city}</Text>
          <Text style={styles.sheetSub}>
            {sheetCity?.shows?.length ?? 0} shows
          </Text>
          <FlatList
            contentContainerStyle={{ paddingBottom: theme.spacing.md }}
            data={sheetCity?.shows ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ScaledPressable
                onPress={() => {
                  closeSheet();
                  navigation.navigate('ShowDetail', {
                    show: item,
                    wishlist: false,
                  });
                }}
                style={styles.sheetCard}
              >
                <ArtistShowMedia
                  artistName={item.artist}
                  borderRadius={theme.radius.md}
                  fallbackUri={item.imageUrl}
                  initialLetterSize={40}
                  style={styles.sheetThumb}
                />
                <View style={styles.sheetCardText}>
                  <Text numberOfLines={1} style={styles.sheetArtist}>
                    {item.artist}
                  </Text>
                  <Text numberOfLines={1} style={styles.sheetVenue}>
                    {item.venue}
                  </Text>
                  <Text style={styles.sheetDate}>
                    {formatListDate(item.date)}
                  </Text>
                </View>
                <Ionicons color={theme.primary} name="chevron-forward" size={20} />
              </ScaledPressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  orangePin: {
    backgroundColor: theme.primary,
    borderColor: theme.card,
    borderRadius: 14,
    borderWidth: 2,
    height: 24,
    width: 24,
  },
  header: {
    backgroundColor: theme.background,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    zIndex: 2,
  },
  loadingBox: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  map: {
    flex: 1,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.logSheetTop,
    borderTopRightRadius: theme.radius.logSheetTop,
    maxHeight: '52%',
    paddingHorizontal: theme.spacing.md,
    ...theme.rnShadowLg,
  },
  sheetArtist: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: theme.typography.fontSize.md,
  },
  sheetBackdrop: {
    backgroundColor: theme.backdrop,
    flex: 1,
  },
  sheetCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  sheetCardText: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  sheetDate: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.caption,
    marginTop: 2,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: theme.border,
    borderRadius: 2,
    height: 4,
    marginBottom: theme.spacing.md,
    width: 40,
  },
  sheetSub: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.md,
  },
  sheetThumb: {
    borderRadius: theme.radius.md,
    height: 56,
    overflow: 'hidden',
    width: 56,
  },
  sheetTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.lg,
    marginBottom: theme.spacing.xs,
  },
  sheetVenue: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginTop: 2,
  },
  sub: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xxs,
  },
  title: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.myShowsTitle,
  },
  webFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  webText: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.md,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
});
