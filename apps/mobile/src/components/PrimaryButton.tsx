import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'dark';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  return (
    <Pressable
      style={[styles.base, variant === 'dark' && styles.dark, (disabled || loading) && styles.disabled, style]}
      disabled={disabled || loading}
      onPress={onPress}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#167C5A', borderRadius: 14, padding: 16, alignItems: 'center' },
  dark: { backgroundColor: '#14251F' },
  disabled: { opacity: 0.4 },
  label: { color: '#FFFFFF', fontWeight: '800' },
});
