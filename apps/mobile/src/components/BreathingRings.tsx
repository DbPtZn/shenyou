import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '@/theme/tokens';

interface BreathingRingsProps {
  /** 是否正在播放：仅播放时运行呼吸循环（暂停时静止，省电且语义正确） */
  active: boolean;
}

/**
 * 呼吸圆环（对照原型 #page-player）。
 * 8 秒周期、低透明度——宪法动画纪律（200-400ms ease-out）的允许例外。
 * 三层圆环，第二层错相半周期，形成连续的呼吸感。
 */
export function BreathingRings({ active }: BreathingRingsProps) {
  const phaseA = useRef(new Animated.Value(0)).current;
  const phaseB = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      return;
    }
    const loopA = Animated.loop(
      Animated.sequence([
        Animated.timing(phaseA, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(phaseA, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ]),
    );
    const loopB = Animated.loop(
      Animated.sequence([
        Animated.timing(phaseB, { toValue: 0, duration: 4000, useNativeDriver: true }),
        Animated.timing(phaseB, { toValue: 1, duration: 4000, useNativeDriver: true }),
      ]),
    );
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [active, phaseA, phaseB]);

  const ringStyle = (
    phase: Animated.Value,
    size: number,
    borderColor: string,
  ): Animated.AnimatedProps<ViewStyle> => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1,
    borderColor,
    position: 'absolute',
    transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.05] }) }],
    opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
  });

  return (
    <View style={styles.container}>
      <Animated.View style={ringStyle(phaseA, 230, 'rgba(240,206,142,0.5)')} />
      <Animated.View style={ringStyle(phaseB, 270, 'rgba(139,156,255,0.45)')} />
      <Animated.View style={ringStyle(phaseA, 300, 'rgba(197,139,255,0.35)')} />
      <View style={styles.core}>
        <Ionicons name="moon" size={44} color={colors.gold} />
        <Text style={styles.coreText}>{active ? '正在伴眠' : '已暂停'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 300, height: 300, justifyContent: 'center', alignItems: 'center' },
  core: { justifyContent: 'center', alignItems: 'center', gap: 8 },
  coreText: { color: colors.tx2, fontSize: fontSize.caption, letterSpacing: 2 },
});
