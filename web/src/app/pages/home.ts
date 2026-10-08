import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { Tigris } from '../ui/tigris';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Tigris],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card center stack narrow">
      <div><app-tigris [state]="auth.isAuthenticated() ? 'cheer' : 'idle'" [size]="180" /></div>
      @if (auth.isAuthenticated()) {
        <h1>Welcome{{ auth.isGuest() ? '' : ', ' + auth.user()?.displayName }}!</h1>
        <p class="muted">
          Tigris is warming up. The Tamil course path, lessons, XP and streaks arrive in the next phase.
          Your account is ready and signed in.
        </p>
        @if (auth.isGuest()) {
          <p class="notice">You are using a guest account. <a routerLink="/settings">Create an account</a> to keep your progress.</p>
        }
      } @else {
        <h1>Learn Tamil with Tigris</h1>
        <p class="muted">Short lessons, real audio and a score that shows how fast you are improving.</p>
        <div class="stack">
          <button type="button" (click)="startGuest()" [disabled]="busy()">Try it as a guest</button>
          <a class="button secondary" routerLink="/register">Create an account</a>
          <a routerLink="/login">I already have an account</a>
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      }
    </section>
  `,
})
export class Home {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected startGuest(): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.startAsGuest().subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/']);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
