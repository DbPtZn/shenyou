import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChapterStop } from '@/api/content';
import { colors, fontSize, spacing } from '@/theme/tokens';

interface StationDotsProps {
  stops: ChapterStop[];
  positionSec: number;
  durationSec: number;
}

/**
 * 旅程站点进度点（对照原型 #page-player，与 Chapter.stops 联动）。
 * timeSec 已过 → done（月光金实心）；当前将到的一站 → cur（放大高亮）；其余 → todo。
 */
export function StationDots({ stops, positionSec, durationSec }: StationDotsProps) {
  if (stops.length === 0) {
    return null;
  }

  const currentIdx = stops.findIndex((s) => s.timeSec > positionSec);
  const lineProgress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.row}>
          <View style={styles.lineTrack}>
            <View style={[styles.lineFill, { width: `${lineProgress * 100}%` }]} />
          </View>
          {stops.map((stop, idx) => {
            const state =
              currentIdx === -1 || idx < currentIdx ? 'done' : idx === currentIdx ? 'cur' : 'todo';
            return (
              <View key={`${stop.timeSec}-${stop.title}`} style={styles.station}>
                <View style={[styles.dot, dotStyles[state]]} />
                <Text style={[styles.label, state === 'todo' ? styles.labelTodo : null]}>
                  {stop.title}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const dotStyles = StyleSheet.create({
  done: { backgroundColor: colors.gold, borderColor: colors.gold },
  cur: {
    backgroundColor: colors.pBg,
    borderColor: colors.gold,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  todo: { backgroundColor: colors.pBg2, borderColor: colors.line },
});

const styles = StyleSheet.create({
  container: { width: '100%' },
  scrollContent: { paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, paddingVertical: spacing.sm },
  lineTrack: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 6,
    height: 2,
    backgroundColor: colors.line,
  },
  lineFill: { height: '100%', backgroundColor: 'rgba(240,206,142,0.5)' },
  station: { alignItems: 'center', gap: 6, width: 52 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  label: { color: colors.tx2, fontSize: fontSize.caption },
  labelTodo: { color: colors.tx3 },
});
