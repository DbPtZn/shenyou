import type { AudioPlayer } from 'expo-audio';
import { usePlayerStore } from '@/state/player-store';

/**
 * 睡眠定时器（宪法 §7.5）。
 * 档位：15/30/45/60 分钟、播完本章、不限时；默认 30 分钟。
 * 到点后 60 秒线性渐弱至 0 再暂停；运行中随时可取消。
 */

export type TimerKind = 'minutes' | 'chapter' | 'unlimited';

/** 渐弱时长：60 秒 */
const FADE_MS = 60_000;
/** 渐弱采样步长：500ms 一帧，足够平滑且省电 */
const FADE_STEP_MS = 500;

interface TimerBindings {
  getPlayer: () => AudioPlayer;
  /** 由 player.service 注入：暂停时同步中断状态机 */
  pause: () => void;
}

class SleepTimer {
  private bindings: TimerBindings | null = null;

  private deadline: number | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  private fadeHandle: ReturnType<typeof setInterval> | null = null;
  private savedVolume = 1;

  /** “播完本章”是否已布防 */
  private chapterArmed = false;
  /** 本次启动后是否已配置过（未配置时播放开始自动用 30 分钟默认档） */
  private configured = false;

  bind(bindings: TimerBindings): void {
    this.bindings = bindings;
  }

  /**
   * 选择档位并启动。
   * @param kind minutes / chapter / unlimited
   * @param minutes kind=minutes 时的分钟数
   */
  start(kind: TimerKind, minutes?: number): void {
    this.stopInternal();
    this.configured = true;

    if (kind === 'unlimited') {
      this.publishTimer({
        timerKind: 'unlimited',
        timerMinutes: null,
        timerEndsAt: null,
        timerRemainingMs: 0,
        timerFading: false,
      });
      return;
    }

    if (kind === 'chapter') {
      this.chapterArmed = true;
      this.publishTimer({
        timerKind: 'chapter',
        timerMinutes: null,
        timerEndsAt: null,
        timerRemainingMs: 0,
        timerFading: false,
      });
      return;
    }

    const mins = minutes ?? 30;
    this.deadline = Date.now() + mins * 60_000;
    this.publishTimer({
      timerKind: 'minutes',
      timerMinutes: mins,
      timerEndsAt: this.deadline,
      timerRemainingMs: mins * 60_000,
      timerFading: false,
    });
    this.tickHandle = setInterval(() => this.tick(), 1000);
  }

  /** 播放开始时调用：未配置过则自动布防默认 30 分钟档 */
  ensureArmed(): void {
    if (!this.configured) {
      this.start('minutes', 30);
    }
  }

  /** 取消定时器（渐弱中取消会立即恢复音量并继续播放） */
  cancel(): void {
    const wasFading = this.fadeHandle !== null;
    this.stopInternal();
    this.configured = true;

    if (wasFading) {
      const player = this.bindings?.getPlayer();
      if (player) {
        player.volume = this.savedVolume;
      }
    }

    this.publishTimer({
      timerKind: 'unlimited',
      timerMinutes: null,
      timerEndsAt: null,
      timerRemainingMs: 0,
      timerFading: false,
    });
  }

  isChapterArmed(): boolean {
    return this.chapterArmed;
  }

  /** 章节自然播完且“播完本章”已布防：定时器消费完成 */
  completeChapter(): void {
    this.chapterArmed = false;
    this.stopInternal();
    this.configured = true;
    this.publishTimer({
      timerKind: 'unlimited',
      timerMinutes: null,
      timerEndsAt: null,
      timerRemainingMs: 0,
      timerFading: false,
    });
  }

  // ── 内部实现 ──

  private tick(): void {
    if (this.deadline === null) {
      return;
    }
    const remain = this.deadline - Date.now();
    if (remain <= 0) {
      this.clearTick();
      this.beginFade();
    } else {
      this.publishTimer({ timerRemainingMs: remain });
    }
  }

  private beginFade(): void {
    const player = this.bindings?.getPlayer();
    if (!player) {
      return;
    }

    this.savedVolume = player.volume > 0 ? player.volume : 1;
    this.publishTimer({ timerFading: true, timerRemainingMs: 0 });

    const startedAt = Date.now();
    this.fadeHandle = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= FADE_MS) {
        player.volume = 0;
        this.clearFade();
        // 渐弱到底后暂停，再恢复正常音量属性，供下次播放
        this.bindings?.pause();
        player.volume = this.savedVolume;
        this.deadline = null;
        this.configured = true;
        this.publishTimer({
          timerKind: 'unlimited',
          timerMinutes: null,
          timerEndsAt: null,
          timerRemainingMs: 0,
          timerFading: false,
        });
      } else {
        player.volume = this.savedVolume * (1 - elapsed / FADE_MS);
      }
    }, FADE_STEP_MS);
  }

  private stopInternal(): void {
    this.clearTick();
    this.clearFade();
    this.deadline = null;
    this.chapterArmed = false;
  }

  private clearTick(): void {
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private clearFade(): void {
    if (this.fadeHandle !== null) {
      clearInterval(this.fadeHandle);
      this.fadeHandle = null;
    }
  }

  private publishTimer(patch: Partial<TimerStateShape>): void {
    usePlayerStore.getState().publish(patch);
  }
}

/** 定时器在 store 中暴露的字段（与 player-store 对齐） */
export interface TimerStateShape {
  timerKind: TimerKind;
  timerMinutes: number | null;
  timerEndsAt: number | null;
  timerRemainingMs: number;
  timerFading: boolean;
}

export const sleepTimer = new SleepTimer();
