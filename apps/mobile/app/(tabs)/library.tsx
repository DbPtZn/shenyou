import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getJourneys, type JourneyListItem } from '@/api/content';
import { ApiError } from '@/api/client';
import { GradientPlaceholder } from '@/components/GradientPlaceholder';
import { colors, fontSize, lineHeight, radius, spacing } from '@/theme/tokens';

const FILTERS = ['全部', '铁路', '水路', '徒步', '公路', '飞行', '星空营地'];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState('全部');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['journeys', 'library', activeFilter, search],
    queryFn: () => getJourneys({ page: 1, pageSize: 50, tag: activeFilter !== '全部' ? activeFilter : undefined }),
  });

  const journeys = data?.items ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 搜索框 */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索旅程场景"
          placeholderTextColor={colors.tx3}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* 筛选 chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {/* 双列卡片流 */}
      <FlatList
        data={journeys}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => {
          if (isLoading) return <Text style={styles.hintText}>加载中…</Text>;
          if (error) return <Text style={styles.errorText}>{error instanceof ApiError ? error.message : '加载失败'}</Text>;
          return <Text style={styles.hintText}>暂无匹配的旅程</Text>;
        }}
        renderItem={({ item }) => <LibraryCard item={item} />}
      />
    </View>
  );
}

function LibraryCard({ item }: { item: JourneyListItem }) {
  return (
    <Link href={`/journey/${item.id}`} asChild>
      <Pressable style={styles.card}>
        <GradientPlaceholder variant="card" style={styles.cardCover}>
          <Text style={styles.cardDuration}>{Math.floor(item.totalDurationSec / 60)}分钟</Text>
        </GradientPlaceholder>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {item.subtitle ? <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
          {!item.isFree && <Text style={styles.memberTag}>会员</Text>}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  searchWrap: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.tx,
    fontSize: fontSize.body,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  filterChip: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  filterChipActive: { backgroundColor: colors.vio },
  filterText: { color: colors.tx2, fontSize: fontSize.caption },
  filterTextActive: { color: '#0A0F22', fontWeight: '600' },
  columnWrapper: { gap: spacing.md, paddingHorizontal: spacing.base },
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cardCover: { height: 120, justifyContent: 'flex-end', padding: spacing.sm },
  cardDuration: { color: colors.tx2, fontSize: fontSize.caption, textAlign: 'right' },
  cardBody: { padding: spacing.md },
  cardTitle: { color: colors.tx, fontSize: fontSize.body, fontWeight: '600', lineHeight: lineHeight.tight },
  cardSubtitle: { color: colors.tx2, fontSize: fontSize.caption, marginTop: 2 },
  memberTag: { color: colors.gold, fontSize: fontSize.caption, marginTop: spacing.xs },
  hintText: { color: colors.tx3, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xxxl },
  errorText: { color: colors.gold, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xxxl },
});
