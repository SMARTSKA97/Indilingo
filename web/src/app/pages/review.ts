import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card stack">
      <h1>Review</h1>
      <p>
        This is where the reviewer will read each chapter as a list, listen to every audio clip, and approve, fix or flag
        each exercise. The review screen arrives in phase 3. Your reviewer login is already set up.
      </p>
    </section>
  `,
})
export class Review {}
