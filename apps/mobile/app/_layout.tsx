import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { OfflineNotice } from '@/components/OfflineNotice';
import { initAudioSession } from '@/audio/player.service';
import { getPurchases } from '@/purchases/purchases.factory';
import { useAuthStore } from '@/state/auth-store';
import { queryClient } from '@/state/query-client';
import { shenyouTheme } from '@/theme/theme';
import { colors } from '@/theme/tokens';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

/** 鉴权门：未登录跳转 login，已登录在 login/register 跳回首页 */
function useAuthGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isHydrated) return;

    const inAuthGroup = pathname === '/login' || pathname === '/register';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isHydrated, pathname, router]);
}

/** 购买服务绑定：登录后 configure + RC login(userId)，退出时 logout */
function usePurchasesBinding() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!isHydrated) return;
    const purchases = getPurchases();
    try {
      purchases.configure();
    } catch {
      // 真实模式下缺少平台 key 时静默（factory 默认 mock，正常不会触发）
      return;
    }
    if (isAuthenticated && userId) {
      purchases.login(userId).catch(() => undefined);
    } else {
      purchases.logout().catch(() => undefined);
    }
  }, [isHydrated, isAuthenticated, userId]);
}

export default function RootLayout() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize().finally(() => SplashScreen.hideAsync());
  }, [initialize]);

  // §7.1：启动时配置一次音频会话（失败静默，播放前服务内会兜底）
  useEffect(() => {
    initAudioSession().catch(() => undefined);
  }, []);

  useAuthGate();
  usePurchasesBinding();

  if (!isHydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={shenyouTheme}>
        <StatusBar style="light" />
        <View style={styles.root}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.pBg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />
            <Stack.Screen name="journey/[id]" />
            <Stack.Screen name="player" options={{ presentation: 'modal' }} />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            <Stack.Screen name="legal/privacy" />
            <Stack.Screen name="legal/terms" />
            <Stack.Screen name="report" />
          </Stack>
          <OfflineNotice />
        </View>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pBg },
});
