import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { graphemes } from '../core/graphemes';
import { CharacterState, Tigris } from '../ui/tigris';

@Component({
  selector: 'app-design',
  imports: [Tigris],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <h1>Design system</h1>

      <section class="card stack" aria-labelledby="tigris-h">
        <h2 id="tigris-h">Tigris</h2>
        <p class="muted">The lead guide, in the four states every character will support.</p>
        <div class="row">
          @for (s of states; track s) {
            <figure class="state">
              <app-tigris [state]="s" [size]="120" />
              <figcaption>{{ s }}</figcaption>
            </figure>
          }
        </div>
      </section>

      <section class="card stack" aria-labelledby="tamil-h">
        <h2 id="tamil-h">Tamil text</h2>
        <p class="muted">Rendered with the bundled Noto Sans Tamil font so it looks the same on every device.</p>
        <p class="tamil big" lang="ta">வணக்கம்! நான் தண்ணீர் குடிக்கிறேன்.</p>
        <label>
          Try a word (letters are split the way a learner sees them)
          <input [value]="sample()" (input)="sample.set($any($event.target).value)" lang="ta" class="tamil" />
        </label>
        <p>
          @for (g of letters(); track $index) {
            <span class="tile tamil" lang="ta">{{ g }}</span>
          }
        </p>
        <p class="muted">{{ letters().length }} letters, {{ codePoints() }} code points</p>
      </section>

      <section class="card stack" aria-labelledby="ui-h">
        <h2 id="ui-h">Controls</h2>
        <div class="row">
          <button type="button">Primary</button>
          <button type="button" class="secondary">Secondary</button>
          <button type="button" class="ghost">Ghost</button>
          <button type="button" disabled>Disabled</button>
        </div>
        <p class="notice">A notice looks like this.</p>
        <p class="error">An error looks like this.</p>
      </section>
    </div>
  `,
  styles: `
    .state { margin: 0; text-align: center; }
    figcaption { color: var(--color-text-muted); font-size: 0.9rem; }
    .big { font-size: 1.6rem; }
    .tile {
      display: inline-block; min-width: 2.2em; text-align: center; margin: 0 4px 6px 0; padding: 4px 8px;
      background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: 8px; font-size: 1.3rem;
    }
  `,
})
export class Design {
  protected readonly states: CharacterState[] = ['idle', 'talking', 'cheer', 'sad'];
  protected readonly sample = signal('கொடு');

  protected letters(): string[] {
    return graphemes(this.sample());
  }

  protected codePoints(): number {
    return Array.from(this.sample().normalize('NFC')).length;
  }
}
