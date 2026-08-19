import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry' | 'style'> & {
  style?: StyleProp<ViewStyle>;
};

export function PasswordInput({ style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <TextInput
        {...props}
        style={styles.input}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        hitSlop={8}
        style={styles.toggle}
        onPress={() => setVisible((value) => !value)}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color="#596A64" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE7E2',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 15,
    color: '#14251F',
  },
  toggle: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
