import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet } from '@/components/BottomSheet';
import { usePlayerStore } from '@/state/player-store';
import type { MixPreset } from '@/state/player-store';
import { switchPreset } from '@/audio/player.service';
import { ApiError } from '@/api/client';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

interface MixerSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface PresetOption {
  id: MixPreset;
  label: string;
  description: string;
  ratios: { narration: number; ambient: number; music: number };
}

/**
 * 音景调音台（对照原型 #sheet-mix，按导读决策 D1 的 MVP 路线）。
 * 三轨比例映射为服务端预置混音成品：切换即更换播放源并保持当前进度。
 * 禁止客户端三轨同步播放。
 */
const PRESETS: PresetOption[] = [
  {
    id: 'default',
    label: '默认混音',
    description: '引导清晰，适合跟随旅程',
    ratios: { narration: 40, ambient: 35, music: 25 },
  },
  {
    id: 'relax',
    label: '放松混音',
    description: '环境更宽，入睡前更柔和',
    ratios: { narration: 25, ambient: 50, music: 25 },
  },
];

export function MixerSheet({ visible, onClose }: MixerSheetProps) {
  const router = useRouter();
  const mixPreset = usePlayerStore((s) => s.mixPreset);
  const switching = usePlayerStore((s) => s.presetSwitching);
  const [pending, setPending] = useState<MixPreset | null>(null);

  const handleSelect = async (preset: MixPreset): Promise<void> => {
    if (preset === mixPreset) {
      onClose();
      return;
    }
    setPending(preset);
    try {
      await switchPreset(preset);
      onClose();
    } catch (error) {
      // 4001/4002：关闭面板并引导订阅，不弹通用错误
      if (error instanceof ApiError && (error.code === 4001 || error.code === 4002)) {
        onClose();
        router.push('/paywall');
        return;
      }
      Alert.alert('稍后再试', error instanceof Error ? error.message : '混音切换失败，请稍后再试');
    } finally {
      setPending(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>音景调音台</Text>
        <Text style={styles.subtitle}>预置混音版本，切换即换播放源并保持当前进度</Text>
      </View>

      <View style={styles.list}>
        {PRESETS.map((opt) => {
          const active = mixPreset === opt.id;
          const busy = switching && pending === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[styles.card, active ? styles.cardOn : null]}
              disabled={switching}
              onPress={() => void handleSelect(opt.id)}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.cardLabel, active ? styles.cardLabelOn : null]}>
                  {busy ? '切换中…' : opt.label}
                </Text>
                {active ? <Text style={styles.activeTag}>播放中</Text> : null}
              </View>
              <Text style={styles.cardDesc}>{opt.description}</Text>
              <View style={styles.ratios}>
                <RatioRow label="旁白" value={opt.ratios.narration} color={colors.vio} />
                <RatioRow label="环境" value={opt.ratios.ambient} color={colors.green} />
                <RatioRow label="配乐" value={opt.ratios.music} color={colors.gold} />
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.tip}>入睡前可将旁白调低、环境音调高，减少唤醒度</Text>
    </BottomSheet>
  );
}

function RatioRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.ratioRow}>
      <Text style={styles.ratioLabel}>{label}</Text>
      <View style={styles.ratioTrack}>
        <View style={[styles.ratioFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.ratioValue}>{value}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.lg },
  title: { color: colors.tx, fontSize: fontSize.title, fontWeight: '600' },
  subtitle: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.xs },
  list: { gap: spacing.md },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: spacing.base,
  },
  cardOn: { borderColor: colors.gold, backgroundColor: 'rgba(240,206,142,0.08)' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '600' },
  cardLabelOn: { color: colors.gold },
  activeTag: { color: colors.goldDim, fontSize: fontSize.caption },
  cardDesc: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.xs },
  ratios: { marginTop: spacing.md, gap: spacing.sm },
  ratioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratioLabel: { width: 32, color: colors.tx3, fontSize: fontSize.caption },
  ratioTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.card2, overflow: 'hidden' },
  ratioFill: { height: '100%', borderRadius: 2 },
  ratioValue: { width: 36, textAlign: 'right', color: colors.tx2, fontSize: fontSize.caption },
  tip: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.lg, lineHeight: 18 },
});
