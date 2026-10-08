import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tigris } from '../ui/tigris';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Tigris],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card center stack narrow">
      <app-tigris state="sad" [size]="140" />
      <h1>Page not found</h1>
      <p class="muted">Tigris looked everywhere and could not find that page.</p>
      <a class="button" routerLink="/">Back to start</a>
    </section>
  `,
})
export class NotFound {}
