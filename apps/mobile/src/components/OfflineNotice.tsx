import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useUIStore } from '@/state/ui-store';
import { colors, fontSize, spacing } from '@/theme/tokens';

/** 离线提示横幅：网络断开时从顶部滑入（200ms ease-out） */
export function OfflineNotice() {
  const isOffline = useUIStore((s) => s.isOffline);
  const translateY = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isOffline ? 0 : -60,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isOffline, translateY]);

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <Text style={styles.text}>网络似乎断开了，部分内容可能无法加载</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.pBg2,
    borderBottomColor: colors.gold,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    zIndex: 999,
  },
  text: {
    color: colors.gold,
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
});
