import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../theme';

const DEFAULT_FS = theme.typography.fontSize.statNumber;
const DEFAULT_LH = DEFAULT_FS * theme.typography.lineHeight.tight;
const RESUME_FS = 28;
const RESUME_LH = RESUME_FS * theme.typography.lineHeight.tight;

export default function GradientStatNumber({ size = 'default', value }) {
  const str = String(value);
  const isResume = size === 'resume';
  const fontSize = isResume ? RESUME_FS : DEFAULT_FS;
  const lineHeight = isResume ? RESUME_LH : DEFAULT_LH;
  const fontFamily = theme.typography.fontFamily.display;
  const textStyle = { fontFamily, fontSize, lineHeight, textAlign: 'center' };

  return (
    <MaskedView
      maskElement={
        <View style={styles.maskWrap}>
          <Text style={[styles.maskTextBase, textStyle]}>{str}</Text>
        </View>
      }
      style={[styles.masked, { height: lineHeight }]}
    >
      <LinearGradient
        colors={theme.linearGradientColors}
        end={theme.linearGradientEnd}
        start={theme.linearGradientStart}
        style={styles.gradient}
      >
        <Text style={[styles.hiddenBase, textStyle, { opacity: 0 }]}>{str}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  gradient: {
    justifyContent: 'center',
  },
  hiddenBase: {
    backgroundColor: 'transparent',
    color: theme.text,
  },
  maskTextBase: {
    backgroundColor: 'transparent',
    color: theme.text,
  },
  maskWrap: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexGrow: 1,
    justifyContent: 'center',
  },
  masked: {
    alignSelf: 'center',
    flexDirection: 'row',
  },
});
