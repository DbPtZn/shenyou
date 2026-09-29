import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { usePlayerStore } from '@/state/player-store';
import { sleepTimer } from '@/audio/sleep-timer';
import type { TimerKind } from '@/audio/sleep-timer';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

interface TimerSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface Option {
  kind: TimerKind;
  minutes?: number;
  label: string;
  badge?: string;
}

const OPTIONS: Option[] = [
  { kind: 'minutes', minutes: 15, label: '15 分钟' },
  { kind: 'minutes', minutes: 30, label: '30 分钟', badge: '常用' },
  { kind: 'minutes', minutes: 45, label: '45 分钟' },
  { kind: 'minutes', minutes: 60, label: '60 分钟' },
  { kind: 'chapter', label: '播完本章' },
  { kind: 'unlimited', label: '不限时' },
];

/** 睡眠定时面板（对照原型 #sheet-timer，档位文案逐字一致） */
export function TimerSheet({ visible, onClose }: TimerSheetProps) {
  const { timerKind, timerMinutes, timerEndsAt, timerRemainingMs, timerFading } = usePlayerStore();

  const isActive = timerEndsAt !== null || timerKind === 'chapter' || timerFading;

  const isSelected = (opt: Option): boolean => {
    if (opt.kind === 'minutes') {
      return timerKind === 'minutes' && timerMinutes === opt.minutes;
    }
    return timerKind === opt.kind;
  };

  const handleSelect = (opt: Option): void => {
    sleepTimer.start(opt.kind, opt.minutes);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>定时入眠</Text>
        <Text style={styles.subtitle}>到点后音量渐弱至停止，守护整晚安睡</Text>
      </View>

      <View style={styles.grid}>
        {OPTIONS.map((opt) => {
          const selected = isSelected(opt);
          return (
            <Pressable
              key={opt.label}
              style={[styles.option, selected ? styles.optionOn : null]}
              onPress={() => handleSelect(opt)}
            >
              <Text style={[styles.optionText, selected ? styles.optionTextOn : null]}>
                {opt.label}
              </Text>
              {opt.badge ? <Text style={[styles.badge, selected ? styles.badgeOn : null]}>{opt.badge}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {isActive ? (
        <Pressable style={styles.cancel} onPress={() => sleepTimer.cancel()}>
          <Text style={styles.cancelText}>
            {timerFading ? '渐弱中 · 取消并恢复音量' : `取消定时${formatRemaining(timerKind, timerRemainingMs)}`}
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

function formatRemaining(kind: TimerKind, remainingMs: number): string {
  if (kind !== 'minutes') {
    return '';
  }
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `（剩余 ${m}:${s.toString().padStart(2, '0')}）`;
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.lg },
  title: { color: colors.tx, fontSize: fontSize.title, fontWeight: '600' },
  subtitle: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  option: {
    width: '47%',
    flexGrow: 1,
    height: 52,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionOn: { borderColor: colors.gold, backgroundColor: 'rgba(240,206,142,0.1)' },
  optionText: { color: colors.tx2, fontSize: fontSize.body },
  optionTextOn: { color: colors.gold, fontWeight: '600' },
  badge: { color: colors.tx3, fontSize: fontSize.caption },
  badgeOn: { color: colors.goldDim },
  cancel: { marginTop: spacing.lg, alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.base },
  cancelText: { color: colors.tx3, fontSize: fontSize.body },
});
