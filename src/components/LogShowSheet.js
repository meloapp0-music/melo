import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildArtistSubtitle, searchArtists } from '../api/musicbrainz';
import { searchCities, searchVenuesByCity } from '../api/nominatim';
import { fetchLatestSetlist } from '../api/setlistFm';
import ScaledPressable from './ScaledPressable';
import { ShimmerPlaceholder } from './ShimmerPlaceholder';
import theme from '../theme';

const VIBES = [
  { emoji: '🔥', id: 'insane', label: 'Insane' },
  { emoji: '⚡', id: 'electric', label: 'Electric' },
  { emoji: '😭', id: 'emotional', label: 'Emotional' },
  { emoji: '🎉', id: 'party', label: 'Party' },
  { emoji: '🤯', id: 'mind', label: 'Mind-blowing' },
  { emoji: '🫶', id: 'special', label: 'Special' },
  { emoji: '🎵', id: 'nostalgic', label: 'Nostalgic' },
  { emoji: '🌧️', id: 'intimate', label: 'Intimate' },
];

function scoreMoodLabel(score) {
  if (score == null) {
    return '';
  }
  if (score <= 3) {
    return 'Rough night 😬';
  }
  if (score <= 5) {
    return 'It was alright 😐';
  }
  if (score <= 7) {
    return 'Really good 😊';
  }
  if (score <= 9) {
    return 'Incredible 🔥';
  }
  return 'Life-changing 🤯';
}

const screenHeight = Dimensions.get('window').height;
const sheetMaxH = screenHeight;

export default function LogShowSheet({
  editingId = null,
  initialShow = null,
  onClose,
  onSave,
  visible,
  wishlistEdit = false,
}) {
  const insets = useSafeAreaInsets();
  const sheetY = useRef(new Animated.Value(screenHeight)).current;
  const dragStartY = useRef(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  const [artist, setArtist] = useState('');
  const [artistMbid, setArtistMbid] = useState(null);
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [showDate, setShowDate] = useState(() => new Date());
  const [setlistText, setSetlistText] = useState('');
  const [supportActs, setSupportActs] = useState('');
  const [friends, setFriends] = useState('');
  const [notes, setNotes] = useState('');
  const [score, setScore] = useState(null);
  const [vibes, setVibes] = useState(() => new Set());

  const [mbResults, setMbResults] = useState([]);
  const [mbLoading, setMbLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [venueResults, setVenueResults] = useState([]);
  const [venueLoading, setVenueLoading] = useState(false);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const [cityResults, setCityResults] = useState([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showVenueCityHint, setShowVenueCityHint] = useState(false);
  const [setlistLoading, setSetlistLoading] = useState(false);
  const [errors, setErrors] = useState({ artist: '', score: '' });
  const [photos, setPhotos] = useState([]);

  const abortMb = useRef(null);
  const abortSetlist = useRef(null);
  const abortVenue = useRef(null);
  const abortCity = useRef(null);
  const skipVenueSearchRef = useRef(false);
  const skipCitySearchRef = useRef(false);

  const setlistKey = Constants.expoConfig?.extra?.setlistFmApiKey ?? '';

  const resetForm = useCallback(() => {
    setArtist('');
    setArtistMbid(null);
    setVenue('');
    setCity('');
    setShowDate(new Date());
    setSetlistText('');
    setSupportActs('');
    setFriends('');
    setNotes('');
    setScore(null);
    setVibes(new Set());
    setMbResults([]);
    setShowDropdown(false);
    setVenueResults([]);
    setShowVenueDropdown(false);
    setVenueLoading(false);
    setCityResults([]);
    setShowCityDropdown(false);
    setCityLoading(false);
    setShowVenueCityHint(false);
    setErrors({ artist: '', score: '' });
    setTempDate(new Date());
    setPhotos([]);
  }, []);

  const hydrateFromShow = useCallback((show) => {
    if (!show) {
      return;
    }
    setArtist(show.artist ?? '');
    setArtistMbid(show.artistMbid ?? null);
    setVenue(show.venue ?? '');
    setCity(show.city ?? '');
    const d = new Date(show.date);
    const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
    setShowDate(safeDate);
    setScore(show.score ?? null);
    setSetlistText((show.setlist || []).join('\n'));
    setNotes(show.notes ?? '');
    setSupportActs((show.supportActs || []).join(', '));
    setFriends((show.friends || []).join(', '));
    setVibes(new Set(show.vibes || []));
    setPhotos(
      Array.isArray(show.photos) ? show.photos.filter(Boolean) : [],
    );
    setMbResults([]);
    setShowDropdown(false);
    setVenueResults([]);
    setShowVenueDropdown(false);
    setVenueLoading(false);
    setCityResults([]);
    setShowCityDropdown(false);
    setCityLoading(false);
    setShowVenueCityHint(false);
    setErrors({ artist: '', score: '' });
    setTempDate(safeDate);
  }, []);

  const springClose = useCallback(
    (done) => {
      Animated.spring(sheetY, {
        friction: 8,
        tension: 65,
        toValue: screenHeight,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          done?.();
        }
      });
    },
    [sheetY],
  );

  const handleClose = useCallback(() => {
    springClose(() => {
      resetForm();
      onClose?.();
    });
  }, [onClose, resetForm, springClose]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    sheetY.setValue(screenHeight);
    if (initialShow) {
      hydrateFromShow(initialShow);
    } else {
      resetForm();
    }
    Animated.spring(sheetY, {
      friction: 7,
      tension: 68,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [visible, editingId, initialShow?.id, hydrateFromShow, resetForm, sheetY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          sheetY.stopAnimation((v) => {
            dragStartY.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = Math.max(0, dragStartY.current + g.dy);
          sheetY.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const pos = dragStartY.current + g.dy;
          if (pos > screenHeight * 0.12 || g.vy > 1.1) {
            handleClose();
          } else {
            Animated.spring(sheetY, {
              friction: 8,
              tension: 65,
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [handleClose, sheetY],
  );

  useEffect(() => {
    if (!artist.trim() || artist.length < 2) {
      setMbResults([]);
      setShowDropdown(false);
      return;
    }
    const t = setTimeout(() => {
      abortMb.current?.abort();
      abortMb.current = new AbortController();
      setMbLoading(true);
      searchArtists(artist, abortMb.current.signal)
        .then((list) => {
          setMbResults(list);
          setShowDropdown(list.length > 0);
        })
        .catch(() => {
          setMbResults([]);
          setShowDropdown(false);
        })
        .finally(() => setMbLoading(false));
    }, 380);
    return () => clearTimeout(t);
  }, [artist]);

  useEffect(() => {
    if (skipCitySearchRef.current) {
      skipCitySearchRef.current = false;
      return;
    }
    if (!city.trim() || city.length < 2) {
      setCityResults([]);
      setShowCityDropdown(false);
      return;
    }
    const t = setTimeout(() => {
      abortCity.current?.abort();
      abortCity.current = new AbortController();
      setCityLoading(true);
      searchCities(city, abortCity.current.signal)
        .then((list) => {
          setCityResults(list);
          setShowCityDropdown(list.length > 0);
        })
        .catch(() => {
          setCityResults([]);
          setShowCityDropdown(false);
        })
        .finally(() => setCityLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [city]);

  useEffect(() => {
    if (skipVenueSearchRef.current) {
      skipVenueSearchRef.current = false;
      return;
    }
    if (!city.trim() || city.trim().length < 2 || !venue.trim() || venue.length < 2) {
      setVenueResults([]);
      setShowVenueDropdown(false);
      return;
    }
    const t = setTimeout(() => {
      abortVenue.current?.abort();
      abortVenue.current = new AbortController();
      setVenueLoading(true);
      searchVenuesByCity(venue, city, abortVenue.current.signal)
        .then((list) => {
          setVenueResults(list);
          setShowVenueDropdown(list.length > 0);
        })
        .catch(() => {
          setVenueResults([]);
          setShowVenueDropdown(false);
        })
        .finally(() => setVenueLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [city, venue]);

  const applySetlistPrefill = useCallback(
    async (mbid) => {
      if (!mbid || !setlistKey) {
        return;
      }
      abortSetlist.current?.abort();
      abortSetlist.current = new AbortController();
      setSetlistLoading(true);
      try {
        const data = await fetchLatestSetlist(
          mbid,
          setlistKey,
          abortSetlist.current.signal,
        );
        if (data) {
          if (data.venue) {
            setVenue(data.venue);
          }
          if (data.city) {
            setCity(data.city);
          }
          if (data.date instanceof Date && !Number.isNaN(data.date.getTime())) {
            setShowDate(data.date);
          }
          if (data.setlistText) {
            setSetlistText(data.setlistText);
          }
        }
      } finally {
        setSetlistLoading(false);
      }
    },
    [setlistKey],
  );

  const selectArtist = useCallback(
    (a) => {
      setMbResults([]);
      setArtist(a.name);
      setArtistMbid(a.id || null);
      setShowDropdown(false);
      setShowVenueDropdown(false);
      if (a.id) {
        applySetlistPrefill(a.id);
      }
    },
    [applySetlistPrefill],
  );

  const selectVenue = useCallback((row) => {
    skipVenueSearchRef.current = true;
    abortVenue.current?.abort();
    setVenueResults([]);
    setShowVenueDropdown(false);
    setVenue(row.label);
  }, []);

  const selectCity = useCallback((row) => {
    skipCitySearchRef.current = true;
    abortCity.current?.abort();
    setCityResults([]);
    setShowCityDropdown(false);
    setShowVenueCityHint(false);
    setCity(row.label);
  }, []);

  const persistPickedPhotos = useCallback(async (assets) => {
    if (Platform.OS === 'web') {
      return assets.map((a) => a.uri).filter(Boolean);
    }
    const baseDir = `${FileSystem.documentDirectory}melo-show-photos`;
    const dirInfo = await FileSystem.getInfoAsync(baseDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    }
    const out = [];
    const stamp = Date.now();
    for (let i = 0; i < assets.length; i++) {
      const from = assets[i]?.uri;
      if (!from) {
        continue;
      }
      const match = from.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      const suffix = match ? match[1] : 'jpg';
      const dest = `${baseDir}/photo-${stamp}-${i}.${suffix}`;
      await FileSystem.copyAsync({ from, to: dest });
      out.push(dest);
    }
    return out;
  }, []);

  const pickPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 0,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const uris = await persistPickedPhotos(result.assets);
    if (uris.length) {
      setPhotos((prev) => [...prev, ...uris]);
    }
  }, [persistPickedPhotos]);

  const removePhoto = useCallback((uri) => {
    setPhotos((prev) => prev.filter((u) => u !== uri));
    if (
      Platform.OS !== 'web' &&
      uri?.startsWith?.(FileSystem.documentDirectory)
    ) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }, []);

  const toggleVibe = useCallback((id) => {
    setVibes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const onPickScore = useCallback((n) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setScore(n);
    setErrors((e) => ({ ...e, score: '' }));
  }, []);

  const openDatePicker = useCallback(() => {
    setTempDate(showDate);
    setDatePickerOpen(true);
  }, [showDate]);

  const onDateChange = useCallback((_, selected) => {
    if (Platform.OS === 'android') {
      setDatePickerOpen(false);
    }
    if (selected) {
      setShowDate(selected);
      setTempDate(selected);
    }
  }, []);

  const confirmIosDate = useCallback(() => {
    setShowDate(tempDate);
    setDatePickerOpen(false);
  }, [tempDate]);

  const validateAndSave = useCallback(() => {
    const next = { artist: '', score: '' };
    if (!artist.trim()) {
      next.artist = 'Artist is required';
    }
    if (!wishlistEdit && score == null) {
      next.score = 'Pick a score';
    }
    setErrors(next);
    if (next.artist || next.score) {
      return;
    }
    const songs = setlistText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const basePayload = {
      artist: artist.trim(),
      artistMbid,
      city: city.trim(),
      date: showDate.toISOString(),
      friends: friends
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      notes: notes.trim(),
      score,
      setlist: songs,
      supportActs: supportActs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      venue: venue.trim(),
      vibes: [...vibes],
      photos: wishlistEdit ? [] : [...photos],
    };
    const payload =
      editingId != null
        ? { ...basePayload, editingId, wishlistEdit }
        : basePayload;
    springClose(() => {
      onSave?.(payload);
      resetForm();
      onClose?.();
    });
  }, [
    artist,
    artistMbid,
    city,
    editingId,
    friends,
    notes,
    onClose,
    onSave,
    resetForm,
    score,
    setlistText,
    showDate,
    springClose,
    supportActs,
    venue,
    vibes,
    photos,
    wishlistEdit,
  ]);

  const dateStr = useMemo(
    () =>
      showDate.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [showDate],
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="none" transparent visible={visible}>
      <View style={styles.modalRoot}>
        <ScaledPressable
          contentStyle={[
            styles.backdrop,
            { backgroundColor: theme.backdrop },
          ]}
          onPress={handleClose}
        >
          <View />
        </ScaledPressable>
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetMaxH,
              maxHeight: sheetMaxH,
              paddingBottom: insets.bottom,
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View
            style={[
              styles.safeSheet,
              { paddingTop: insets.top + theme.spacing.xs },
            ]}
          >
            <View style={styles.whiteTop} {...panResponder.panHandlers}>
              <View style={styles.headerRow}>
                <ScaledPressable onPress={handleClose} style={styles.headerBtnHit}>
                  <Text style={styles.headerCancel}>Cancel</Text>
                </ScaledPressable>
                <Text style={styles.sheetTitle}>
                  {editingId ? 'Edit show' : 'Log a Show'}
                </Text>
                <ScaledPressable onPress={validateAndSave} style={styles.headerBtnHit}>
                  <Text style={styles.headerDone}>Done</Text>
                </ScaledPressable>
              </View>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={insets.top + theme.spacing.xs}
              style={styles.kav}
            >
            <ScrollView
              contentContainerStyle={styles.scrollInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Artist name</Text>
              <View style={styles.inputShell}>
                <TextInput
                  autoCorrect={false}
                  onChangeText={(t) => {
                    setArtist(t);
                    setErrors((e) => ({ ...e, artist: '' }));
                  }}
                  onFocus={() => {
                    setShowVenueDropdown(false);
                    if (mbResults.length > 0) {
                      setShowDropdown(true);
                    }
                  }}
                  placeholder="Search artists"
                  placeholderTextColor={theme.muted}
                  style={styles.inputInner}
                  value={artist}
                />
                {mbLoading ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : null}
              </View>
              {mbLoading ? (
                <ShimmerPlaceholder
                  borderRadius={theme.radius.sm}
                  height={40}
                  style={{ marginBottom: theme.spacing.sm }}
                />
              ) : null}
              {errors.artist ? (
                <Text style={styles.errorText}>{errors.artist}</Text>
              ) : null}

              {showDropdown && mbResults.length > 0 ? (
                <View style={styles.dropdown}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={styles.dropdownScroll}
                  >
                    {mbResults.map((item) => (
                      <ScaledPressable
                        key={item.id}
                        onPress={() => selectArtist(item)}
                        style={styles.dropdownRow}
                      >
                        <Text style={styles.dropdownName}>{item.name}</Text>
                        <Text style={styles.dropdownSub}>
                          {buildArtistSubtitle(item)}
                        </Text>
                      </ScaledPressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {setlistLoading ? (
                <Text style={styles.hint}>Loading latest setlist…</Text>
              ) : null}

              <Text style={styles.label}>City</Text>
              <View style={styles.inputShell}>
                <TextInput
                  onChangeText={(t) => {
                    setCity(t);
                    setShowVenueCityHint(false);
                    setShowVenueDropdown(false);
                    setShowDropdown(false);
                  }}
                  onFocus={() => {
                    setShowDropdown(false);
                    setShowVenueDropdown(false);
                    if (cityResults.length > 0) {
                      setShowCityDropdown(true);
                    }
                  }}
                  placeholder="City"
                  placeholderTextColor={theme.muted}
                  style={styles.inputInner}
                  value={city}
                />
                {cityLoading ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <Ionicons
                    color={theme.subtext}
                    name="pencil-outline"
                    size={theme.typography.fontSize.md}
                  />
                )}
              </View>

              {showCityDropdown && cityResults.length > 0 ? (
                <View style={styles.dropdown}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={styles.dropdownScroll}
                  >
                    {cityResults.map((row) => (
                      <ScaledPressable
                        key={row.id}
                        onPress={() => selectCity(row)}
                        style={styles.dropdownRow}
                      >
                        <Text style={styles.dropdownName}>{row.label}</Text>
                        <Text style={styles.dropdownSub}>
                          {row.subtitle}
                        </Text>
                      </ScaledPressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.label}>Venue</Text>
              <View style={styles.inputShell}>
                <TextInput
                  onChangeText={(t) => {
                    setVenue(t);
                    setShowDropdown(false);
                  }}
                  onFocus={() => {
                    setShowDropdown(false);
                    setShowCityDropdown(false);
                    if (!city.trim()) {
                      setShowVenueCityHint(true);
                      setShowVenueDropdown(false);
                      return;
                    }
                    if (venueResults.length > 0) {
                      setShowVenueDropdown(true);
                    }
                  }}
                  placeholder="Venue name"
                  placeholderTextColor={theme.muted}
                  style={styles.inputInner}
                  value={venue}
                />
                {venueLoading ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <Ionicons
                    color={theme.subtext}
                    name="pencil-outline"
                    size={theme.typography.fontSize.md}
                  />
                )}
              </View>
              {showVenueCityHint ? (
                <Text style={styles.venueHint}>
                  Enter a city first to search venues
                </Text>
              ) : null}

              {showVenueDropdown && venueResults.length > 0 ? (
                <View style={styles.venueDropdown}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={styles.dropdownScroll}
                  >
                    {venueResults.map((row) => (
                      <ScaledPressable
                        key={row.id}
                        onPress={() => selectVenue(row)}
                        style={styles.venueDropdownRow}
                      >
                        <Text style={styles.venueDropdownName}>{row.label}</Text>
                        <Text style={styles.venueDropdownSub}>
                          {row.subtitle}
                        </Text>
                      </ScaledPressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.label}>Date</Text>
              <ScaledPressable
                onPress={openDatePicker}
                style={styles.dateTouch}
              >
                <Text style={styles.dateTouchText}>{dateStr}</Text>
                <Ionicons
                  color={theme.subtext}
                  name="calendar-outline"
                  size={theme.typography.fontSize.md}
                />
              </ScaledPressable>

              <Text style={styles.label}>Score</Text>
              <ScrollView
                contentContainerStyle={styles.scoreRow}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const selected = score === n;
                  return (
                    <ScaledPressable
                      key={n}
                      onPress={() => onPickScore(n)}
                      style={[
                        styles.scoreCell,
                        {
                          borderRadius: theme.radius.scoreSquare,
                          height: theme.layout.scoreSquare,
                          width: theme.layout.scoreSquare,
                        },
                        !selected && styles.scoreCellIdle,
                      ]}
                    >
                      {selected ? (
                        <LinearGradient
                          colors={theme.linearGradientColors}
                          end={theme.linearGradientEnd}
                          start={theme.linearGradientStart}
                          style={[
                            styles.scoreGrad,
                            {
                              borderRadius: theme.radius.scoreSquare,
                              height: theme.layout.scoreSquare,
                              width: theme.layout.scoreSquare,
                            },
                          ]}
                        >
                          <Text style={styles.scoreNumOn}>{n}</Text>
                        </LinearGradient>
                      ) : (
                        <Text style={styles.scoreNumOff}>{n}</Text>
                      )}
                    </ScaledPressable>
                  );
                })}
              </ScrollView>
              {errors.score ? (
                <Text style={styles.errorText}>{errors.score}</Text>
              ) : null}
              <Text style={styles.scoreMood}>{scoreMoodLabel(score)}</Text>

              <Text style={styles.label}>Vibe</Text>
              <ScrollView
                contentContainerStyle={styles.vibeRow}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {VIBES.map((v) => {
                  const on = vibes.has(v.id);
                  return (
                    <ScaledPressable
                      key={v.id}
                      onPress={() => toggleVibe(v.id)}
                      style={styles.vibeHit}
                    >
                      {on ? (
                        <LinearGradient
                          colors={theme.linearGradientColors}
                          end={theme.linearGradientEnd}
                          start={theme.linearGradientStart}
                          style={styles.vibeChipOn}
                        >
                          <Text style={styles.vibeChipOnText}>
                            {v.emoji} {v.label}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.vibeChipOff}>
                          <Text style={styles.vibeChipOffText}>
                            {v.emoji} {v.label}
                          </Text>
                        </View>
                      )}
                    </ScaledPressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Support acts</Text>
              <View style={styles.inputShell}>
                <TextInput
                  onChangeText={setSupportActs}
                  placeholder="Tyler Childers, Amos Lee"
                  placeholderTextColor={theme.muted}
                  style={styles.inputInner}
                  value={supportActs}
                />
              </View>

              <Text style={styles.label}>Friends who came</Text>
              <View style={styles.inputShell}>
                <Ionicons
                  color={theme.subtext}
                  name="people-outline"
                  size={theme.typography.fontSize.md}
                  style={styles.inputIconLeft}
                />
                <TextInput
                  onChangeText={setFriends}
                  placeholder="Names, comma separated"
                  placeholderTextColor={theme.muted}
                  style={[styles.inputInner, styles.inputWithLeftIcon]}
                  value={friends}
                />
              </View>

              <Text style={styles.label}>Setlist</Text>
              <View style={[styles.inputShell, styles.multilineShell]}>
                <TextInput
                  multiline
                  onChangeText={setSetlistText}
                  placeholder="Song names, one per line"
                  placeholderTextColor={theme.muted}
                  style={[styles.inputInner, styles.setlistInput, styles.multiline]}
                  textAlignVertical="top"
                  value={setlistText}
                />
              </View>

              <Text style={styles.label}>Notes</Text>
              <View style={[styles.inputShell, styles.multilineShell]}>
                <TextInput
                  multiline
                  onChangeText={setNotes}
                  placeholder="How was the crowd? Any memorable moments?"
                  placeholderTextColor={theme.muted}
                  style={[styles.inputInner, styles.multiline]}
                  textAlignVertical="top"
                  value={notes}
                />
              </View>

              {!wishlistEdit ? (
                <>
                  <Text style={styles.label}>Add photos</Text>
                  <ScaledPressable
                    onPress={pickPhotos}
                    style={styles.photoAddBtn}
                  >
                    <Ionicons color={theme.primary} name="add" size={28} />
                  </ScaledPressable>
                  {photos.length > 0 ? (
                    <ScrollView
                      contentContainerStyle={styles.photoStrip}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      {photos.map((uri) => (
                        <View key={uri} style={styles.photoThumbWrap}>
                          <Image
                            contentFit="cover"
                            source={{ uri }}
                            style={styles.photoThumb}
                          />
                          <ScaledPressable
                            onPress={() => removePhoto(uri)}
                            style={styles.photoRemoveHit}
                          >
                            <Ionicons color={theme.card} name="close" size={14} />
                          </ScaledPressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </>
              ) : null}

              <View style={styles.bottomPad} />
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
              <ScaledPressable
                onPress={validateAndSave}
              >
                <LinearGradient
                  colors={theme.linearGradientColors}
                  end={theme.linearGradientEnd}
                  start={theme.linearGradientStart}
                  style={styles.saveBtn}
                >
                  <Text style={styles.saveBtnText}>
                    {editingId ? 'Save changes' : 'Save Show'}
                  </Text>
                </LinearGradient>
              </ScaledPressable>
            </View>
            </KeyboardAvoidingView>
          </View>
        </Animated.View>
      </View>

      {datePickerOpen && Platform.OS === 'ios' ? (
        <Modal animationType="fade" transparent visible={datePickerOpen}>
          <View style={styles.dateModalRoot}>
            <ScaledPressable
              contentStyle={[
                styles.dateModalBackdrop,
                { backgroundColor: theme.backdrop },
              ]}
              onPress={() => setDatePickerOpen(false)}
            >
              <View />
            </ScaledPressable>
            <View
              style={[
                styles.dateSheet,
                { paddingBottom: insets.bottom + theme.spacing.lg },
              ]}
            >
              <View style={styles.dateSheetHeader}>
                <ScaledPressable onPress={() => setDatePickerOpen(false)}>
                  <Text style={styles.dateLink}>Cancel</Text>
                </ScaledPressable>
                <Text style={styles.dateSheetTitle}>Date</Text>
                <ScaledPressable onPress={confirmIosDate}>
                  <Text style={styles.dateLink}>Done</Text>
                </ScaledPressable>
              </View>
              <DateTimePicker
                display="spinner"
                mode="date"
                onChange={(_, d) => d && setTempDate(d)}
                style={styles.wheel}
                themeVariant="light"
                value={tempDate}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {datePickerOpen && Platform.OS === 'android' ? (
        <DateTimePicker
          display="default"
          mode="date"
          onChange={onDateChange}
          value={showDate}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomPad: {
    height: theme.spacing.xxxl,
  },
  dateLink: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  dateModalBackdrop: {
    flex: 1,
  },
  dateModalRoot: {
    flex: 1,
  },
  dateSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.logSheetTop,
    borderTopRightRadius: theme.radius.logSheetTop,
    ...theme.rnShadowLg,
  },
  dateSheetHeader: {
    alignItems: 'center',
    borderBottomColor: theme.borderLight,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dateSheetTitle: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
  },
  dateTouch: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.rnShadowSm,
  },
  dateTouchText: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
  },
  dropdown: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    maxHeight: screenHeight * 0.28,
    ...theme.rnShadowMd,
  },
  dropdownName: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.normal,
  },
  dropdownRow: {
    borderBottomColor: theme.borderLight,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dropdownScroll: {
    maxHeight: screenHeight * 0.28,
  },
  dropdownSub: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.disambiguation,
    lineHeight:
      theme.typography.fontSize.disambiguation *
      theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  venueDropdown: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    maxHeight: screenHeight * 0.28,
    ...theme.rnShadowMd,
  },
  venueDropdownName: {
    color: '#1C1917',
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 15 * theme.typography.lineHeight.normal,
  },
  venueDropdownRow: {
    borderBottomColor: theme.borderLight,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  venueDropdownSub: {
    color: '#78716C',
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * theme.typography.lineHeight.normal,
    marginTop: theme.spacing.xxs,
  },
  venueHint: {
    color: '#A8A29E',
    fontFamily: theme.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * theme.typography.lineHeight.normal,
    marginBottom: theme.spacing.sm,
    marginTop: -theme.spacing.xs,
  },
  errorText: {
    color: theme.error,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.error,
    lineHeight:
      theme.typography.fontSize.error * theme.typography.lineHeight.normal,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.xxs,
  },
  footer: {
    backgroundColor: theme.background,
    borderTopColor: theme.borderLight,
    borderTopWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  handleBar: {
    display: 'none',
  },
  headerBtnHit: {
    minWidth: 64,
    paddingVertical: theme.spacing.xs,
  },
  headerCancel: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 16,
    textAlign: 'left',
  },
  headerDone: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: 16,
    textAlign: 'right',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  hint: {
    color: theme.muted,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.sm,
  },
  inputIconLeft: {
    marginRight: theme.spacing.xs,
  },
  inputInner: {
    color: theme.text,
    flex: 1,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    paddingVertical: theme.spacing.sm,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    ...theme.rnShadowSm,
  },
  inputWithLeftIcon: {
    paddingLeft: 0,
  },
  kav: {
    flex: 1,
  },
  label: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.seeAll,
    letterSpacing: theme.typography.letterSpacing.fieldUppercase,
    lineHeight:
      theme.typography.fontSize.seeAll * theme.typography.lineHeight.normal,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  multiline: {
    minHeight: theme.spacing.xxxl * 3,
    paddingTop: theme.spacing.sm,
  },
  multilineShell: {
    alignItems: 'stretch',
  },
  photoAddBtn: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.card,
    borderColor: theme.primary,
    borderRadius: theme.radius.md,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    height: 72,
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    width: 72,
    ...theme.rnShadowSm,
  },
  photoRemoveHit: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
  },
  photoStrip: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  photoThumb: {
    height: '100%',
    width: '100%',
  },
  photoThumbWrap: {
    borderRadius: theme.radius.md,
    height: 72,
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
    width: 72,
  },
  saveBtn: {
    alignItems: 'center',
    borderRadius: theme.radius.saveButton,
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    ...theme.rnShadowMd,
  },
  saveBtnText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodyBold,
    fontSize: theme.typography.fontSize.saveCta,
    letterSpacing: theme.typography.letterSpacing.interUi,
    lineHeight:
      theme.typography.fontSize.saveCta * theme.typography.lineHeight.tight,
  },
  scoreCell: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.xs,
    overflow: 'hidden',
  },
  scoreCellIdle: {
    backgroundColor: theme.surface,
  },
  scoreGrad: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreMood: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  scoreNumOff: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.md,
  },
  scoreNumOn: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.displayBold,
    fontSize: theme.typography.fontSize.md,
  },
  scoreRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.xs,
  },
  scrollInner: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  setlistInput: {
    fontSize: theme.typography.fontSize.setlistInput,
    lineHeight:
      theme.typography.fontSize.setlistInput *
      theme.typography.lineHeight.relaxed,
  },
  sheet: {
    backgroundColor: theme.background,
    borderTopLeftRadius: theme.radius.logSheetTop,
    borderTopRightRadius: theme.radius.logSheetTop,
    overflow: 'hidden',
  },
  safeSheet: {
    flex: 1,
  },
  sheetTitle: {
    color: '#1C1917',
    flex: 1,
    fontFamily: theme.typography.fontFamily.displaySemi,
    fontSize: 17,
    lineHeight: 17 * theme.typography.lineHeight.tight,
    textAlign: 'center',
  },
  vibeChipOff: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  vibeChipOffText: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.seeAll,
  },
  vibeChipOn: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  vibeChipOnText: {
    color: theme.card,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.seeAll,
  },
  vibeHit: {
    marginRight: theme.spacing.sm,
  },
  vibeRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  wheel: {
    height: theme.spacing.xxxxl * 4,
  },
  whiteTop: {
    backgroundColor: theme.card,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    paddingTop: theme.spacing.xs,
  },
});
