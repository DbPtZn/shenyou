import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MiniPlayer } from '@/components/MiniPlayer';
import { colors, fontSize, sizes, spacing } from '@/theme/tokens';

/**
 * 四 Tab 布局（prototype-guide.md §1）：
 * 发现 / 场景库 / 工坊 / 我的
 * 仅 Tab 页显示 TabBar 与迷你播放条。
 */
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = sizes.tabBarHeight + insets.bottom;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.tabBg,
            borderTopColor: colors.line,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingBottom: insets.bottom,
            paddingTop: spacing.xs,
          },
          tabBarActiveTintColor: colors.vio,
          tabBarInactiveTintColor: colors.tx3,
          tabBarLabelStyle: { fontSize: fontSize.caption, fontWeight: '500' },
          tabBarIconStyle: { marginBottom: 2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '发现',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="compass" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: '场景库',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="studio"
          options={{
            title: '工坊',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="color-wand" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="mine"
          options={{
            title: '我的',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* 迷你播放条浮在 TabBar 上方 */}
      <View style={[styles.miniPlayerWrapper, { bottom: tabBarHeight }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  miniPlayerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
