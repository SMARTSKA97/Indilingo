import { Injectable, effect, signal } from '@angular/core';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'indilingo.theme';
const MOTION_KEY = 'indilingo.reduceMotion';

/** Theme and motion preferences. 'system' follows the device; motion follows the device unless set explicitly. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(this.read<ThemeChoice>(KEY, 'system'));
  /** null means "follow the device setting". */
  readonly reduceMotionOverride = signal<boolean | null>(this.readMotion());

  constructor() {
    effect(() => {
      const choice = this.choice();
      const root = document.documentElement;
      if (choice === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', choice);
      this.write(KEY, choice);
    });
    effect(() => {
      const override = this.reduceMotionOverride();
      const root = document.documentElement;
      if (override === null) root.removeAttribute('data-motion');
      else root.setAttribute('data-motion', override ? 'reduced' : 'full');
      this.write(MOTION_KEY, override === null ? 'system' : String(override));
    });
  }

  /** True when animations should be replaced by static states. */
  prefersReducedMotion(): boolean {
    const override = this.reduceMotionOverride();
    if (override !== null) return override;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  cycle(): void {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    this.choice.set(order[(order.indexOf(this.choice()) + 1) % order.length]);
  }

  private readMotion(): boolean | null {
    const raw = this.read<string>(MOTION_KEY, 'system');
    return raw === 'true' ? true : raw === 'false' ? false : null;
  }

  private read<T extends string>(key: string, fallback: T): T {
    try {
      return (localStorage.getItem(key) as T | null) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: preference lasts for this session only */
    }
  }
}
