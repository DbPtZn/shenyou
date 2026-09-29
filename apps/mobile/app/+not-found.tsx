import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '页面不存在' }} />
      <View style={styles.container}>
        <Text style={styles.title}>页面走丢了</Text>
        <Text style={styles.subtitle}>可能是链接已失效，回到首页继续探索吧</Text>
        <Link href="/" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>回到首页</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pBg, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  title: { color: colors.tx, fontSize: fontSize.titleLg, fontWeight: '700' },
  subtitle: { color: colors.tx2, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  button: { backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.line },
  buttonText: { color: colors.vio, fontSize: fontSize.bodyLg, fontWeight: '600' },
});
