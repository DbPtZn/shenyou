/**
 * 神游 Design Tokens（直译自 prototype-guide.md §2）
 * 深色默认；宪法 §8：禁止高饱和色、快节奏闪烁、广告式弹窗。
 */

/** 色板 */
export const colors = {
  /** 全局背景 */
  bg: '#070B18',
  bg2: '#0B1126',
  /** 页面/面板背景 */
  pBg: '#0A0F22',
  pBg2: '#0F1630',
  /** 卡片背景（按压态用 card2） */
  card: 'rgba(255,255,255,0.055)',
  card2: 'rgba(255,255,255,0.09)',
  /** 描边/分割线 */
  line: 'rgba(255,255,255,0.09)',
  /** 文字层级 */
  tx: '#EEF2FF',
  tx2: '#A6B0D4',
  tx3: '#68739B',
  /** 月光金：旅程、伴眠、进度、强调 */
  gold: '#F0CE8E',
  goldDim: '#E8A87C',
  /** 星蓝紫：主操作、选中态、Tab 激活 */
  vio: '#8B9CFF',
  /** 辅助点缀 */
  pink: '#C58BFF',
  /** 成功·环境音轨 */
  green: '#7BE8B0',
  /** 径向渐晕色（全局背景装饰） */
  glow: '#1A1F4A',
  /** TabBar 背景 */
  tabBg: 'rgba(7,11,24,0.92)',
} as const;

/** 渐变（expo-linear-gradient colors 数组，135°） */
export const gradients = {
  /** 主按钮、Logo、中央 Tab */
  primary: ['#8B9CFF', '#C58BFF'],
  /** 播放大按钮、金系进度条 */
  gold: ['#F0CE8E', '#E8A87C'],
  /** 卡片封面占位（深色系微紫） */
  cardPlaceholder: ['#1A1F4A', '#0F1630'],
  /** 场景分类渐变占位 */
  sceneWarm: ['#3D2B4E', '#1A1F4A'],
  sceneCool: ['#1B2A4A', '#0F1630'],
  sceneGold: ['#4A3D1F', '#1A1410'],
} as const;

/** 圆角 */
export const radius = {
  card: 18,
  button: 14,
  pill: 999,
  avatar: 14,
  avatarLg: 21,
} as const;

/** 间距（8 倍数体系） */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** 字号 */
export const fontSize = {
  caption: 12,
  body: 14,
  bodyLg: 16,
  title: 18,
  titleLg: 22,
  hero: 28,
  display: 36,
} as const;

/** 行高 */
export const lineHeight = {
  tight: 1.3,
  relaxed: 1.6,
  loose: 1.8,
} as const;

/** 动画时长（ms），全部 ease-out */
export const timing = {
  fast: 200,
  normal: 300,
  slow: 400,
} as const;

/** 组件尺寸 */
export const sizes = {
  buttonHeight: 48,
  iconButton: 40,
  playButton: 70,
  tabBarHeight: 56,
  miniPlayerHeight: 56,
} as const;

/** 字体族（系统栈，不需要自定义字体加载） */
export const fontFamily = {
  sans: undefined, // 使用系统默认（iOS PingFang SC / Android Noto Sans SC）
} as const;
