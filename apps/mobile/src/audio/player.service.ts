import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import {
  favoriteJourney,
  getJourneyDetail,
  getPlayUrl,
  unfavoriteJourney,
  updatePlayback,
} from '@/api/content';
import type { Chapter, JourneyDetail } from '@/api/content';
import { usePlayerStore } from '@/state/player-store';
import type { MixPreset } from '@/state/player-store';
import { sleepTimer } from './sleep-timer';

/**
 * 播放器核心服务（宪法 §7 全部铁律）。
 * - §7.1 音频会话启动时只配置一次（initAudioSession）；
 * - §7.2 后台播放、静音键可播，doNotMix 独占；
 * - §7.4 createAudioPlayer 全局单例，状态经 Zustand 暴露；
 * - §7.5 来电/拔耳机暂停，绝不自动恢复（本文件的中断状态机）；
 * - §7.6 断点续播：进度节流 10s 写 PlaybackHistory。
 */

/** 断点上报节流间隔（秒，§7.6） */
const SYNC_INTERVAL_SEC = 10;
/** 换源后等待加载的超时（毫秒） */
const LOAD_TIMEOUT_MS = 15000;

let sessionConfigured = false;
let player: AudioPlayer | null = null;

// ── 中断状态机（§7.5） ──
// expo-audio 原生层在中断结束（来电挂断 / 音频焦点恢复）时会自动续播，
// JS 层用以下三个标志识别并拦截：
/** 下一个 playing:false 是我们自己发起的（定时器/用户操作） */
let expectingPause = false;
/** 下一个 playing:true 是我们自己发起的 */
let expectingPlay = false;
/**
 * 外部暂停后，紧随的自动续播需要消费掉（立即重新暂停）。
 * 仅消费一次：之后用户按耳机键仍可继续。
 */
let consumeNextExternalPlay = false;

// ── 播放上下文 ──
let journey: JourneyDetail | null = null;
let chapter: Chapter | null = null;
let chapterIndex = 0;

/** 换源/加载中：此期间的 playing:false 不当中断 */
let loadingSource = false;

/** 上次上报位置（秒） */
let lastReportSec = 0;

const loadedResolvers = new Set<() => void>();

/**
 * 启动时配置一次音频会话（§7.1/§7.2）。
 * 在根布局 useEffect 中调用。
 */
export async function initAudioSession(): Promise<void> {
  if (sessionConfigured) {
    return;
  }
  sessionConfigured = true;
  try {
    await setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
    });
  } catch (error) {
    // 允许下次重试
    sessionConfigured = false;
    throw error;
  }
}

/** 获取（懒初始化）全局唯一播放器（§7.4） */
function getPlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null, { updateInterval: 500 });
    player.addListener('playbackStatusUpdate', handleStatus);
    sleepTimer.bind({
      getPlayer,
      pause: internalPause,
    });
  }
  return player;
}

function internalPause(): void {
  expectingPause = true;
  getPlayer().pause();
}

// ── 章节编排 ──

/**
 * 开始播放指定章节：签发地址 → 换源 → 恢复断点 → 锁屏元数据 → 播放。
 * 由详情页 CTA / 发现页“继续收听”调用，成功后再跳转播放页。
 */
export async function startChapter(journeyId: string, chapterId: string): Promise<void> {
  await initAudioSession().catch(() => undefined);
  usePlayerStore.getState().publish({ status: 'loading', errorMessage: null });

  const detail = await ensureJourney(journeyId);
  const idx = detail.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) {
    usePlayerStore.getState().publish({ status: 'idle' });
    throw new Error('章节不属于该旅程');
  }
  chapter = detail.chapters[idx]!;
  chapterIndex = idx;

  const info = await getPlayUrl(chapterId);
  publishContext(detail, chapter, idx, info.mixPreset, info.positionSec);

  const p = getPlayer();
  try {
    await loadSource(p, info.url);
  } catch (error) {
    usePlayerStore.getState().publish({ status: 'error', errorMessage: error instanceof Error ? error.message : '加载失败' });
    throw error;
  }
  await p.seekTo(info.positionSec);

  p.setActiveForLockScreen(
    true,
    { title: chapter.title, artist: '神游', albumTitle: detail.title },
    { showSeekForward: true, showSeekBackward: true },
  );

  expectingPlay = true;
  p.play();
  sleepTimer.ensureArmed();
  usePlayerStore.getState().publish({ status: 'ready' });
}

/**
 * 切换预置混音版本（D1）：更换服务端预置成品播放源，保持当前进度。
 * 禁止客户端三轨同步播放。
 */
export async function switchPreset(preset: MixPreset): Promise<void> {
  if (!journey || !chapter) {
    return;
  }
  const store = usePlayerStore.getState();
  if (store.presetSwitching || store.mixPreset === preset) {
    return;
  }

  store.publish({ presetSwitching: true });
  const p = getPlayer();
  const wasPlaying = p.playing;
  const keepSec = p.currentTime;

  try {
    const info = await getPlayUrl(chapter.id, preset);
    await loadSource(p, info.url);
    await p.seekTo(keepSec);
    store.publish({ mixPreset: info.mixPreset === 'relax' ? 'relax' : 'default' });

    if (wasPlaying) {
      expectingPlay = true;
      p.play();
    }
  } finally {
    usePlayerStore.getState().publish({ presetSwitching: false });
  }
}

// ── 播放控制（UI 直接调用） ──

export function pause(): void {
  internalPause();
}

export function resume(): void {
  consumeNextExternalPlay = false;
  expectingPlay = true;
  getPlayer().play();
  usePlayerStore.getState().publish({ interrupted: false });
}

export function toggle(): void {
  if (getPlayer().playing) {
    pause();
  } else {
    resume();
  }
}

export async function seekBy(delta: number): Promise<void> {
  const p = getPlayer();
  const max = p.duration > 0 ? p.duration : Number.POSITIVE_INFINITY;
  await p.seekTo(Math.max(0, Math.min(max, p.currentTime + delta)));
}

export async function seekTo(sec: number): Promise<void> {
  const p = getPlayer();
  const max = p.duration > 0 ? p.duration : Number.POSITIVE_INFINITY;
  await p.seekTo(Math.max(0, Math.min(max, sec)));
}

/** 收藏 / 取消收藏当前旅程 */
export async function toggleFavorite(): Promise<void> {
  if (!journey) {
    return;
  }
  const next = !usePlayerStore.getState().isFavorited;
  if (next) {
    await favoriteJourney(journey.id);
  } else {
    await unfavoriteJourney(journey.id);
  }
  usePlayerStore.getState().publish({ isFavorited: next });
}

// ── 状态事件与中断状态机 ──

function handleStatus(s: AudioStatus): void {
  const store = usePlayerStore.getState();

  if (s.isLoaded) {
    loadedResolvers.forEach((resolve) => resolve());
    loadedResolvers.clear();
  }

  store.publish({
    positionSec: s.currentTime,
    durationSec: s.duration > 0 ? s.duration : store.durationSec,
    volume: player?.volume ?? store.volume,
    isBuffering: s.isBuffering,
  });

  if (s.didJustFinish) {
    void handleFinished(s);
    return;
  }

  if (s.playing) {
    if (expectingPlay) {
      expectingPlay = false;
      store.publish({ isPlaying: true, interrupted: false });
    } else if (consumeNextExternalPlay) {
      // §7.5：系统在中断结束后自动续播 → 立即重新暂停，绝不自动恢复
      consumeNextExternalPlay = false;
      expectingPause = true;
      getPlayer().pause();
      store.publish({ isPlaying: false });
    } else {
      // 外部发起的播放（耳机线控 / 锁屏按钮），接受
      store.publish({ isPlaying: true, interrupted: false });
    }
    maybeReport(s.currentTime);
    return;
  }

  if (loadingSource || s.isBuffering || s.timeControlStatus === 'waiting') {
    // 换源 / 缓冲中的短暂态，不当中断
    return;
  }

  if (expectingPause) {
    expectingPause = false;
    store.publish({ isPlaying: false });
    void reportNow(s.currentTime);
  } else {
    // 外部暂停：来电开始、拔耳机、耳机键暂停
    consumeNextExternalPlay = true;
    void reportNow(s.currentTime);
    store.publish({ isPlaying: false, interrupted: true });
  }
}

async function handleFinished(s: AudioStatus): Promise<void> {
  await reportNow(s.currentTime);

  if (sleepTimer.isChapterArmed()) {
    // “播完本章”到点：停在章末，不自动续下一章
    sleepTimer.completeChapter();
    expectingPause = true;
    getPlayer().pause();
    usePlayerStore.getState().publish({ isPlaying: false });
    return;
  }

  if (journey) {
    const next = journey.chapters[chapterIndex + 1];
    if (next) {
      try {
        await startChapter(journey.id, next.id);
        return;
      } catch {
        // 续章失败则停在此处
      }
    }
  }

  expectingPause = true;
  getPlayer().pause();
  usePlayerStore.getState().publish({ isPlaying: false });
}

// ── 断点续播上报（§7.6） ──

function maybeReport(currentTime: number): void {
  if (currentTime - lastReportSec >= SYNC_INTERVAL_SEC) {
    lastReportSec = currentTime;
    void safeReport(currentTime);
  }
}

async function reportNow(currentTime: number): Promise<void> {
  lastReportSec = currentTime;
  await safeReport(currentTime);
}

async function safeReport(sec: number): Promise<void> {
  if (!chapter) {
    return;
  }
  try {
    await updatePlayback(chapter.id, Math.floor(sec));
  } catch {
    // 离线或请求失败静默处理，下次节流继续上报
  }
}

// ── 辅助 ──

async function ensureJourney(id: string): Promise<JourneyDetail> {
  if (journey?.id === id) {
    return journey;
  }
  const detail = await getJourneyDetail(id);
  journey = detail;
  return detail;
}

async function loadSource(p: AudioPlayer, url: string): Promise<void> {
  loadingSource = true;
  consumeNextExternalPlay = false;
  expectingPause = false;
  expectingPlay = false;
  try {
    p.replace({ uri: url });
    await waitForLoaded();
  } finally {
    loadingSource = false;
  }
}

function waitForLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (player?.isLoaded === true) {
      resolve();
      return;
    }
    let done = false;
    const finish = (error?: Error): void => {
      if (done) {
        return;
      }
      done = true;
      loadedResolvers.delete(notify);
      clearTimeout(timeoutHandle);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const notify = (): void => finish();
    loadedResolvers.add(notify);
    const timeoutHandle = setTimeout(
      () => finish(new Error('音频加载超时，请检查网络或稍后重试')),
      LOAD_TIMEOUT_MS,
    );
  });
}

function publishContext(
  detail: JourneyDetail,
  ch: Chapter,
  idx: number,
  preset: string,
  positionSec: number,
): void {
  usePlayerStore.getState().publish({
    journeyId: detail.id,
    journeyTitle: detail.title,
    chapterId: ch.id,
    chapterTitle: ch.title,
    chapterIndex: idx,
    chapterCount: detail.chapters.length,
    stops: ch.stops,
    durationSec: ch.durationSec,
    positionSec,
    mixPreset: preset === 'relax' ? 'relax' : 'default',
    isFavorited: detail.isFavorited,
    isPlaying: false,
    interrupted: false,
    presetSwitching: false,
  });
}
