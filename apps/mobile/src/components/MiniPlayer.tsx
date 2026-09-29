import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '@/state/player-store';
import { pause, resume } from '@/audio/player.service';
import { colors, fontSize, gradients, sizes, spacing } from '@/theme/tokens';

/** 迷你播放条：全局悬浮于 TabBar 之上（对照原型 #mini），点击回播放页 */
export function MiniPlayer() {
  const router = useRouter();
  const journeyId = usePlayerStore((s) => s.journeyId);
  const chapterTitle = usePlayerStore((s) => s.chapterTitle);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);

  const bar1 = useRef(new Animated.Value(4)).current;
  const bar2 = useRef(new Animated.Value(8)).current;
  const bar3 = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    if (!isPlaying) {
      [bar1, bar2, bar3].forEach((b) => b.setValue(6));
      return;
    }
    const anim = (bar: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(bar, { toValue: 16, duration: 420, useNativeDriver: false }),
          Animated.timing(bar, { toValue: 4, duration: 420, useNativeDriver: false }),
        ]),
      );
    const a1 = anim(bar1, 0);
    const a2 = anim(bar2, 180);
    const a3 = anim(bar3, 360);
    [a1, a2, a3].forEach((a) => a.start());
    return () => {
      [a1, a2, a3].forEach((a) => a.stop());
    };
  }, [isPlaying, bar1, bar2, bar3]);

  if (!journeyId) {
    return null;
  }

  return (
    <Pressable style={styles.container} onPress={() => router.push('/player')}>
      <View style={styles.eqWrap}>
        <Animated.View style={[styles.eqBar, { height: bar1 }]} />
        <Animated.View style={[styles.eqBar, { height: bar2 }]} />
        <Animated.View style={[styles.eqBar, { height: bar3 }]} />
      </View>
      <View style={styles.info}>
        <Text style={styles.label}>正在播放</Text>
        <Text style={styles.title} numberOfLines={1}>
          {isBuffering ? `${chapterTitle} · 缓冲中` : chapterTitle}
        </Text>
      </View>
      <Pressable onPress={() => (isPlaying ? pause() : resume())}>
        <LinearGradient colors={[...gradients.gold]} style={styles.playBtn}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#1A1410" />
        </LinearGradient>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: sizes.miniPlayerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.tabBg,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  eqWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  eqBar: { width: 3, borderRadius: 2, backgroundColor: colors.vio },
  info: { flex: 1 },
  label: { color: colors.tx3, fontSize: fontSize.caption },
  title: { color: colors.tx, fontSize: fontSize.body, fontWeight: '500' },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
