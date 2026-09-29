import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/state/auth-store';
import { ApiError } from '@/api/client';
import { colors, fontSize, radius, spacing, gradients, sizes } from '@/theme/tokens';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => login(account, password),
    onSuccess: () => router.replace('/(tabs)'),
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : '登录失败，请稍后再试');
    },
  });

  const handleSubmit = () => {
    if (!account.trim() || !password.trim()) {
      setErrorMsg('请输入账号和密码');
      return;
    }
    setErrorMsg(null);
    mutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xxxl, paddingBottom: spacing.xxxl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand}>神游</Text>
          <Text style={styles.tagline}>让声音带你走入梦境</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="手机号或邮箱"
            placeholderTextColor={colors.tx3}
            value={account}
            onChangeText={setAccount}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={colors.tx3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <Pressable disabled={mutation.isPending} onPress={handleSubmit}>
            {({ pressed }) => (
              <LinearGradient
                colors={gradients.primary}
                style={[styles.button, pressed && { opacity: 0.85 }, mutation.isPending && { opacity: 0.5 }]}
              >
                <Text style={styles.buttonText}>{mutation.isPending ? '登录中…' : '登录'}</Text>
              </LinearGradient>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>还没有账号？</Text>
            <Link href="/register" asChild>
              <Pressable><Text style={styles.linkText}>注册</Text></Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pBg },
  header: { alignItems: 'center', marginBottom: spacing.xxxl },
  brand: { color: colors.gold, fontSize: fontSize.display, fontWeight: '700' },
  tagline: { color: colors.tx2, fontSize: fontSize.body, marginTop: spacing.xs },
  form: { paddingHorizontal: spacing.xxl },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    color: colors.tx,
    fontSize: fontSize.bodyLg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorText: { color: colors.gold, fontSize: fontSize.body, marginBottom: spacing.md, textAlign: 'center' },
  button: { height: sizes.buttonHeight, borderRadius: radius.button, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: '#fff', fontSize: fontSize.bodyLg, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
  footerText: { color: colors.tx2, fontSize: fontSize.body },
  linkText: { color: colors.vio, fontSize: fontSize.body, fontWeight: '600' },
});
