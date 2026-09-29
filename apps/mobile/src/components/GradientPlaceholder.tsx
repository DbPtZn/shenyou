import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '@/theme/tokens';

type GradientVariant = 'card' | 'warm' | 'cool' | 'gold' | 'primary';

export interface GradientPlaceholderProps {
  variant?: GradientVariant;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** 获取对应 variant 的渐变色（保留 tuple 类型，满足 LinearGradient colors 约束） */
function getColors(variant: GradientVariant) {
  switch (variant) {
    case 'primary':
      return gradients.primary;
    case 'gold':
      return gradients.gold;
    case 'warm':
      return gradients.sceneWarm;
    case 'cool':
      return gradients.sceneCool;
    default:
      return gradients.cardPlaceholder;
  }
}

/** 渐变占位组件（代替外部图片链接，CLAUDE.md §8） */
export function GradientPlaceholder({ variant = 'card', style, children }: GradientPlaceholderProps) {
  return (
    <LinearGradient colors={getColors(variant)} style={style}>
      {children}
    </LinearGradient>
  );
}
