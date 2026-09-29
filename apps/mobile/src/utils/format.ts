/**
 * 格式化工具：面向用户的中文文案。
 */

/** 将秒格式化为中文时长："X分钟" 或 "X小时Y分钟"。0 / 负数 → "0分钟"。 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0分钟';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;

  if (hours <= 0) return `${minutes}分钟`;
  if (remainMinutes === 0) return `${hours}小时`;
  return `${hours}小时${remainMinutes}分钟`;
}

/** 将秒格式化为播放器时间码 "MM:SS" 或 "H:MM:SS"。 */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const ss = total % 60;
  const mm = Math.floor(total / 60) % 60;
  const hh = Math.floor(total / 3600);
  const pad = (n: number): string => n.toString().padStart(2, '0');

  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

/** 中文相对时间："刚刚" / "X分钟前" / "X小时前" / "X天前"。非法日期返回空串。 */
export function formatRelativeTime(date: string | Date): string {
  const target = date instanceof Date ? date.getTime() : Date.parse(date);
  if (Number.isNaN(target)) return '';

  const diffMs = Date.now() - target;
  if (diffMs < 0) return '刚刚';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return '刚刚';

  const minutes = Math.floor(sec / 60);
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
