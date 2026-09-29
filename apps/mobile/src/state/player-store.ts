import { create } from 'zustand';
import type { ChapterStop } from '@/api/content';

/**
 * 播放器全局态（Zustand）。
 * 宪法 §7.4：播放器必须是全局单例（见 src/audio/player.service.ts），
 * 状态经本 store 暴露，禁止在页面组件里承载主播放。
 * store 只负责状态；播放编排请直接调用 player.service。
 */

/** 预置混音版本（D1：default 40/35/25、relax 25/50/25） */
export type MixPreset = 'default' | 'relax';

export type TimerKind = 'minutes' | 'chapter' | 'unlimited';

interface PlayerState {
  /** 播放器生命周期：idle 未开始 / loading 加载章节中 / ready 可交互 / error 加载失败 */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** 加载失败时的错误文案（供 UI 展示） */
  errorMessage: string | null;

  journeyId: string | null;
  journeyTitle: string;
  chapterId: string | null;
  chapterTitle: string;
  chapterIndex: number;
  chapterCount: number;

  isPlaying: boolean;
  isBuffering: boolean;
  positionSec: number;
  durationSec: number;
  volume: number;

  /** 旅程站点时间轴（与 Chapter.stops 联动） */
  stops: ChapterStop[];
  /** 当前播放源的预置混音版本 */
  mixPreset: MixPreset;
  /** 切换混音版本进行中 */
  presetSwitching: boolean;

  isFavorited: boolean;
  /**
   * 被外部事件中断（来电、拔耳机等）：温柔提示，不自动恢复。
   * 由用户主动操作清除。
   */
  interrupted: boolean;

  // ── 睡眠定时器展示态（由 sleep-timer 模块写入） ──
  timerKind: TimerKind;
  timerMinutes: number | null;
  timerEndsAt: number | null;
  timerRemainingMs: number;
  timerFading: boolean;

  /** 仅供 service / 组件库内部使用的合并写入 */
  publish: (patch: Partial<PlayerState>) => void;
}

const initialState = {
  status: 'idle' as const,
  errorMessage: null as string | null,
  journeyId: null,
  journeyTitle: '',
  chapterId: null,
  chapterTitle: '',
  chapterIndex: 0,
  chapterCount: 0,
  isPlaying: false,
  isBuffering: false,
  positionSec: 0,
  durationSec: 0,
  volume: 1,
  stops: [] as ChapterStop[],
  mixPreset: 'default' as MixPreset,
  presetSwitching: false,
  isFavorited: false,
  interrupted: false,
  timerKind: 'minutes' as TimerKind,
  timerMinutes: null,
  timerEndsAt: null,
  timerRemainingMs: 0,
  timerFading: false,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,
  publish: (patch) => set(patch),
}));
