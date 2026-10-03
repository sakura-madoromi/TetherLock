export type ThemePreference = 'system' | 'light' | 'dark';
export function parseTheme(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function resolvedTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
export function readTheme(): ThemePreference {
  try { return parseTheme(localStorage.getItem('tetherlock.theme')); } catch { return 'system'; }
}
export function saveTheme(value: ThemePreference): boolean {
  try { localStorage.setItem('tetherlock.theme', value); return true; } catch { return false; }
}
export function remainingTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const days = Math.floor(value / 86400);
  const hours = String(Math.floor(value / 3600) % 24).padStart(2, '0');
  const minutes = String(Math.floor(value / 60) % 60).padStart(2, '0');
  const remainder = String(value % 60).padStart(2, '0');
  return days ? `${days} 天 ${hours} 时` : `${hours}:${minutes}:${remainder}`;
}
export function controlLabel(value: string): string {
  return ({boot_recovery:'启动恢复',waiting_for_time:'等待校时',idle_retracted:'空闲已退栓',awaiting_confirmation:'等待本地确认',locking:'正在锁定',timed_locked:'定时锁定',constant_locked:'常锁锁定',unlocking:'正在解锁',fault:'故障'} as Record<string,string>)[value] ?? value;
}
