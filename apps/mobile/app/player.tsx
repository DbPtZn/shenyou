import { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreathingRings } from '@/components/BreathingRings';
import { StationDots } from '@/components/StationDots';
import { TimerSheet } from '@/components/TimerSheet';
import { MixerSheet } from '@/components/MixerSheet';
import {
  pause,
  resume,
  seekBy,
  seekTo,
  toggleFavorite,
} from '@/audio/player.service';
import { usePlayerStore } from '@/state/player-store';
import {
  colors,
  fontSize,
  gradients,
  radius,
  sizes,
  spacing,
} from '@/theme/tokens';

/**
 * 播放页（对照原型 #page-player）。
 * 播放编排由 player.service 在跳转前完成，本页只渲染状态与转发操作。
 */
export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const status = usePlayerStore((s) => s.status);
  const journeyTitle = usePlayerStore((s) => s.journeyTitle);
  const chapterTitle = usePlayerStore((s) => s.chapterTitle);
  const chapterIndex = usePlayerStore((s) => s.chapterIndex);
  const chapterCount = usePlayerStore((s) => s.chapterCount);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const stops = usePlayerStore((s) => s.stops);
  const isFavorited = usePlayerStore((s) => s.isFavorited);
  const interrupted = usePlayerStore((s) => s.interrupted);
  const errorMessage = usePlayerStore((s) => s.errorMessage);
  const timerKind = usePlayerStore((s) => s.timerKind);
  const timerMinutes = usePlayerStore((s) => s.timerMinutes);
  const timerFading = usePlayerStore((s) => s.timerFading);

  const [timerVisible, setTimerVisible] = useState(false);
  const [mixerVisible, setMixerVisible] = useState(false);

  if (status === 'idle' || chapterCount === 0) {
    return (
      <View style={[styles.container, styles.empty, { paddingTop: insets.top }]}>
        <Pressable style={styles.topButton} onPress={router.back}>
          <Ionicons name="chevron-down" size={28} color={colors.tx2} />
        </Pressable>
        <Text style={styles.emptyText}>还没有开始的旅程</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 顶栏 */}
      <View style={styles.topBar}>
        <Pressable style={styles.topButton} onPress={router.back}>
          <Ionicons name="chevron-down" size={28} color={colors.tx2} />
        </Pressable>
        <View style={styles.topCenter}>
          <Text style={styles.brand}>神 游</Text>
          <Text style={styles.topSub} numberOfLines={1}>
            {journeyTitle}
          </Text>
        </View>
        <Pressable style={styles.topButton} onPress={() => setTimerVisible(true)}>
          <Ionicons name="timer-outline" size={24} color={colors.tx2} />
        </Pressable>
      </View>

      {/* 呼吸圆环 */}
      <BreathingRings active={isPlaying} />

      {/* 旅程站点进度点 */}
      <StationDots stops={stops} positionSec={positionSec} durationSec={durationSec} />

      {/* 章节信息 */}
      <Text style={styles.chapterMeta}>
        第 {chapterIndex + 1} 章 · 共 {chapterCount} 章
      </Text>
      <Text style={styles.chapterTitle}>{chapterTitle}</Text>

      {interrupted ? (
        <Text style={styles.interruptHint}>播放中断了，轻轻点一下继续</Text>
      ) : null}

      {status === 'error' && errorMessage ? (
        <Text style={styles.errorHint}>{errorMessage}</Text>
      ) : null}

      {/* 进度条（可拖动） */}
      <SeekBar
        positionSec={positionSec}
        durationSec={durationSec}
        disabled={isBuffering}
        onSeek={(sec) => void seekTo(sec)}
      />

      {/* 控制按钮 */}
      <View style={styles.controls}>
        <Pressable style={styles.sideButton} onPress={router.back}>
          <Ionicons name="list-outline" size={22} color={colors.tx2} />
        </Pressable>
        <Pressable style={styles.skipButton} onPress={() => void seekBy(-15)}>
          <Text style={styles.skipText}>-15s</Text>
        </Pressable>
        <Pressable
          onPress={() => (isPlaying ? pause() : resume())}
          disabled={status === 'loading'}
        >
          <LinearGradient colors={[...gradients.gold]} style={styles.playButton}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={32}
              color="#1A1410"
            />
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.skipButton} onPress={() => void seekBy(15)}>
          <Text style={styles.skipText}>+15s</Text>
        </Pressable>
        <Pressable style={styles.sideButton} onPress={() => void toggleFavorite()}>
          <Ionicons
            name={isFavorited ? 'heart' : 'heart-outline'}
            size={22}
            color={isFavorited ? colors.gold : colors.tx2}
          />
        </Pressable>
      </View>

      {/* 底部工具 */}
      <View style={[styles.tools, { paddingBottom: insets.bottom + spacing.base }]}>
        <Pressable style={styles.toolChip} onPress={() => setMixerVisible(true)}>
          <Ionicons name="options-outline" size={18} color={colors.tx2} />
          <Text style={styles.toolText}>音景调音台</Text>
        </Pressable>
        <Pressable style={styles.toolChip} onPress={() => setTimerVisible(true)}>
          <Ionicons name="moon-outline" size={18} color={colors.tx2} />
          <Text style={styles.toolText}>{timerLabel(timerKind, timerMinutes, timerFading)}</Text>
        </Pressable>
      </View>

      <TimerSheet visible={timerVisible} onClose={() => setTimerVisible(false)} />
      <MixerSheet visible={mixerVisible} onClose={() => setMixerVisible(false)} />
    </View>
  );
}

function timerLabel(kind: string, minutes: number | null, fading: boolean): string {
  if (fading) {
    return '渐弱中';
  }
  if (kind === 'chapter') {
    return '播完本章';
  }
  if (kind === 'unlimited') {
    return '不限时';
  }
  return `${minutes ?? 30} 分钟`;
}

// ── 可拖动进度条 ──

interface SeekBarProps {
  positionSec: number;
  durationSec: number;
  disabled: boolean;
  onSeek: (sec: number) => void;
}

function SeekBar({ positionSec, durationSec, disabled, onSeek }: SeekBarProps) {
  const [dragSec, setDragSec] = useState<number | null>(null);
  const widthRef = useRef(0);

  const secFromX = (x: number): number => {
    const ratio = widthRef.current > 0 ? Math.max(0, Math.min(1, x / widthRef.current)) : 0;
    return ratio * durationSec;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && durationSec > 0,
      onMoveShouldSetPanResponder: () => !disabled && durationSec > 0,
      onPanResponderGrant: (evt) => setDragSec(secFromX(evt.nativeEvent.locationX)),
      onPanResponderMove: (evt) => setDragSec(secFromX(evt.nativeEvent.locationX)),
      onPanResponderRelease: () => {
        setDragSec((cur) => {
          if (cur !== null) {
            onSeek(cur);
          }
          return null;
        });
      },
      onPanResponderTerminate: () => setDragSec(null),
    }),
  ).current;

  const shownSec = dragSec ?? positionSec;
  const progress = durationSec > 0 ? Math.min(1, shownSec / durationSec) : 0;

  return (
    <View style={seekStyles.wrap}>
      <View
        style={seekStyles.bar}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...responder.panHandlers}
      >
        <View style={[seekStyles.fill, { width: `${progress * 100}%` }]} />
        <View style={[seekStyles.dot, { left: `${progress * 100}%` }]} />
      </View>
      <View style={seekStyles.times}>
        <Text style={seekStyles.time}>{formatTime(shownSec)}</Text>
        <Text style={seekStyles.time}>{formatTime(durationSec)}</Text>
      </View>
    </View>
  );
}

function formatTime(sec: number): string {
  if (!sec || sec < 0) {
    return '00:00';
  }
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const seekStyles = StyleSheet.create({
  wrap: { width: '85%', marginTop: spacing.xl },
  bar: { height: 24, justifyContent: 'center' },
  fill: {
    height: 4,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
  },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gold,
    marginLeft: -6,
    top: 6,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  time: {
    color: colors.tx3,
    fontSize: fontSize.caption,
    fontVariant: ['tabular-nums'],
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pBg, alignItems: 'center' },
  empty: { alignItems: 'flex-start' },
  emptyText: {
    color: colors.tx3,
    fontSize: fontSize.body,
    alignSelf: 'center',
    marginTop: 120,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  topButton: { padding: spacing.sm },
  topCenter: { alignItems: 'center', flex: 1 },
  brand: { color: colors.tx, fontSize: fontSize.body, letterSpacing: 4 },
  topSub: { color: colors.tx3, fontSize: fontSize.caption, marginTop: 2 },
  chapterMeta: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.lg },
  chapterTitle: {
    color: colors.gold,
    fontSize: fontSize.titleLg,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  interruptHint: { color: colors.tx2, fontSize: fontSize.body, marginTop: spacing.md },
  errorHint: { color: colors.pink, fontSize: fontSize.body, marginTop: spacing.md, textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '90%',
    marginTop: spacing.xl,
  },
  sideButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  skipButton: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  skipText: { color: colors.tx2, fontSize: fontSize.body, fontWeight: '500' },
  playButton: {
    width: sizes.playButton,
    height: sizes.playButton,
    borderRadius: sizes.playButton / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tools: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.md,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  toolText: { color: colors.tx2, fontSize: fontSize.caption },
});
