import type { Theme } from 'expo-router';
import { DarkTheme } from 'expo-router';
import { colors } from './tokens';

/**
 * 神游自定义深色主题（expo-router ThemeProvider 使用）。
 * 宪法 §8：深色默认，色板与产品原型一致。
 */
export const shenyouTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.vio,
    background: colors.pBg,
    card: colors.pBg2,
    text: colors.tx,
    border: colors.line,
    notification: colors.pink,
  },
};

/** 统一卡片样式 */
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: colors.line,
} as const;

/** 主按钮渐变样式 */
export const primaryButtonStyle = {
  height: 48,
  borderRadius: 14,
} as const;
