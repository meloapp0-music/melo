import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScaledPressable from '../components/ScaledPressable';
import {
  MELO_BELOW_NOTCH_PADDING,
  MELO_SAFE_AREA_EDGES,
} from '../constants/screenLayout';
import { useMeloScrollBottomPadding } from '../hooks/useMeloScrollBottomPadding';
import theme from '../theme';

export default function ProfileScreen({ navigation }) {
  const scrollBottomPad = useMeloScrollBottomPadding(theme.spacing.sm);
  return (
    <SafeAreaView edges={MELO_SAFE_AREA_EDGES} style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollInner,
          { paddingBottom: scrollBottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scrollFlex}
      >
        <ScaledPressable
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Text style={styles.backText}>← Back</Text>
        </ScaledPressable>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.body}>
          Account and preferences will live here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  backText: {
    color: theme.primary,
    fontFamily: theme.typography.fontFamily.bodySemiBold,
    fontSize: theme.typography.fontSize.md,
    lineHeight:
      theme.typography.fontSize.md * theme.typography.lineHeight.normal,
  },
  body: {
    color: theme.subtext,
    fontFamily: theme.typography.fontFamily.body,
    fontSize: theme.typography.fontSize.body,
    lineHeight:
      theme.typography.fontSize.body * theme.typography.lineHeight.relaxed,
    marginTop: theme.spacing.sm,
  },
  root: {
    backgroundColor: theme.background,
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: MELO_BELOW_NOTCH_PADDING,
  },
  title: {
    color: theme.text,
    fontFamily: theme.typography.fontFamily.display,
    fontSize: theme.typography.fontSize.title,
    lineHeight:
      theme.typography.fontSize.title * theme.typography.lineHeight.tight,
  },
});
