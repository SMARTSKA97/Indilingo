import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../core/theme.service';

export type CharacterState = 'idle' | 'talking' | 'cheer' | 'sad';

/**
 * Tigris, the lead guide: a Bengal tiger drawn in SVG and animated with CSS.
 * This is placeholder art with the final interface: other characters and the final
 * Lottie or Rive artwork plug in behind the same state input (see docs/animation-spike.md).
 */
@Component({
  selector: 'app-tigris',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 200 200"
      role="img"
      [attr.aria-label]="'Tigris the tiger, ' + label()"
      [attr.data-state]="state()"
      [class.animated]="animated()"
      [style.width.px]="size()"
      [style.height.px]="size()"
    >
      <g class="body">
        <circle cx="48" cy="56" r="26" fill="#f28c28" />
        <circle cx="152" cy="56" r="26" fill="#f28c28" />
        <circle cx="48" cy="58" r="13" fill="#ffd9a8" />
        <circle cx="152" cy="58" r="13" fill="#ffd9a8" />

        <ellipse cx="100" cy="112" rx="78" ry="70" fill="#f6a03d" />

        <g stroke="#3a2415" stroke-width="7" stroke-linecap="round" fill="none">
          <path d="M100 44 v26" />
          <path d="M76 50 q6 14 15 20" />
          <path d="M124 50 q-6 14 -15 20" />
          <path d="M26 100 q16 4 26 12" />
          <path d="M24 124 q18 2 28 10" />
          <path d="M174 100 q-16 4 -26 12" />
          <path d="M176 124 q-18 2 -28 10" />
        </g>

        <ellipse cx="66" cy="138" rx="28" ry="22" fill="#fff3e0" />
        <ellipse cx="134" cy="138" rx="28" ry="22" fill="#fff3e0" />
        <ellipse cx="100" cy="140" rx="36" ry="26" fill="#fff3e0" />

        <g class="eyes">
          <g class="eye">
            <ellipse cx="70" cy="102" rx="14" ry="16" fill="#fff" stroke="#3a2415" stroke-width="2.5" />
            <circle class="pupil" cx="70" cy="104" r="7" fill="#2a1a0e" />
            <circle cx="73" cy="100" r="2.5" fill="#fff" />
          </g>
          <g class="eye">
            <ellipse cx="130" cy="102" rx="14" ry="16" fill="#fff" stroke="#3a2415" stroke-width="2.5" />
            <circle class="pupil" cx="130" cy="104" r="7" fill="#2a1a0e" />
            <circle cx="133" cy="100" r="2.5" fill="#fff" />
          </g>
        </g>

        @if (state() === 'sad') {
          <path class="brows" d="M54 82 q14 -8 28 2 M118 84 q14 -10 28 -2" stroke="#3a2415" stroke-width="5" stroke-linecap="round" fill="none" />
        }

        <path d="M89 128 h22 l-11 12 z" fill="#d9537a" />
        <path d="M100 140 v8" stroke="#3a2415" stroke-width="3" stroke-linecap="round" />

        @switch (state()) {
          @case ('talking') {
            <ellipse class="mouth mouth-open" cx="100" cy="158" rx="13" ry="9" fill="#7a2a2a" />
          }
          @case ('sad') {
            <path class="mouth" d="M84 160 q16 -12 32 0" stroke="#3a2415" stroke-width="3.5" stroke-linecap="round" fill="none" />
          }
          @case ('cheer') {
            <path class="mouth mouth-smile-open" d="M82 150 q18 24 36 0 z" fill="#7a2a2a" stroke="#3a2415" stroke-width="3" stroke-linejoin="round" />
          }
          @default {
            <path class="mouth" d="M82 150 q18 14 36 0" stroke="#3a2415" stroke-width="3.5" stroke-linecap="round" fill="none" />
          }
        }

        <g stroke="#3a2415" stroke-width="2" stroke-linecap="round">
          <path d="M58 146 h-26 M58 152 l-24 6" />
          <path d="M142 146 h26 M142 152 l24 6" />
        </g>
      </g>

      @if (state() === 'cheer') {
        <g class="sparkles" fill="#ffd23f">
          <path class="sparkle s1" d="M20 30 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 z" />
          <path class="sparkle s2" d="M176 22 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" />
          <path class="sparkle s3" d="M184 90 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" />
        </g>
      }
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    svg { display: block; overflow: visible; }
    .eye, .body, .mouth, .sparkle { transform-box: fill-box; transform-origin: center; }

    .animated .eye { animation: blink 4.2s infinite; }
    .animated[data-state='talking'] .mouth { animation: talk 0.36s ease-in-out infinite alternate; }
    .animated[data-state='cheer'] .body { animation: cheer 0.7s ease-in-out infinite; }
    .animated .sparkle { animation: twinkle 1.1s ease-in-out infinite; }
    .animated .s2 { animation-delay: 0.3s; }
    .animated .s3 { animation-delay: 0.6s; }
    .animated[data-state='idle'] .body { animation: breathe 3.6s ease-in-out infinite; }

    [data-state='sad'] .pupil { transform: translateY(3px); }
    [data-state='sad'] .body { transform: translateY(4px); }

    @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
    @keyframes talk { from { transform: scaleY(0.35); } to { transform: scaleY(1.1); } }
    @keyframes cheer { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-9px) rotate(-2deg); } }
    @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.015); } }
    @keyframes twinkle { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.1); } }
  `,
})
export class Tigris {
  private readonly theme = inject(ThemeService);

  readonly state = input<CharacterState>('idle');
  readonly size = input(160);
  /** Set to false to force the static pose regardless of the device setting. */
  readonly animate = input(true);

  protected readonly animated = computed(() => this.animate() && !this.theme.prefersReducedMotion());

  protected readonly label = computed(() => {
    switch (this.state()) {
      case 'talking':
        return 'speaking';
      case 'cheer':
        return 'cheering';
      case 'sad':
        return 'looking sad';
      default:
        return 'waiting';
    }
  });
}
