import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';

/** Landing page after a social sign-in: trades the one-time code in the URL for tokens. */
@Component({
  selector: 'app-auth-callback',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card narrow center stack">
      @if (error()) {
        <h1>Sign-in failed</h1>
        <p class="error" role="alert">{{ error() }}</p>
        <a class="button" routerLink="/login">Back to sign in</a>
      } @else {
        <h1>Signing you in…</h1>
        <p class="muted" role="status">One moment.</p>
      }
    </section>
  `,
})
export class AuthCallback implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from the ?code query parameter. */
  readonly code = input<string>();
  /** Set by the API when the provider refused or the account could not be created. */
  readonly error_ = input<string>(undefined, { alias: 'error' });

  protected readonly error = signal('');

  ngOnInit(): void {
    const code = this.code();
    if (this.error_() || !code) {
      this.error.set('The sign-in was cancelled or did not complete. Please try again.');
      return;
    }
    this.auth.exchangeExternalCode(code).subscribe({
      next: () => void this.router.navigate(['/'], { replaceUrl: true }),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}
