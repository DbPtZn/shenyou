import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, lineHeight, spacing } from '@/theme/tokens';

export interface LegalSection {
  heading?: string | undefined;
  paragraphs: ReactNode[];
}

/** 法律文档通用布局：返回头 + 标题 + 更新日期 + 章节段落（离线可读） */
export function LegalScreen({
  title,
  updatedAt,
  sections,
}: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.tx} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.base,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={styles.updatedAt}>更新日期：{updatedAt}</Text>

        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            {section.heading ? <Text style={styles.heading}>{section.heading}</Text> : null}
            {section.paragraphs.map((p, j) => (
              <Text key={j} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, padding: spacing.xs },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '600' },
  docTitle: { color: colors.tx, fontSize: fontSize.titleLg, fontWeight: '700' },
  updatedAt: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.xs },
  section: { marginTop: spacing.lg },
  heading: { color: colors.tx, fontSize: fontSize.title, fontWeight: '600', marginBottom: spacing.sm },
  paragraph: {
    color: colors.tx2,
    fontSize: fontSize.body,
    lineHeight: lineHeight.loose,
    marginTop: spacing.xs,
  },
});
