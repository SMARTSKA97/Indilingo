import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { apiError, errorMessage } from '../core/errors';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card narrow stack">
      <h1>Sign in</h1>
      <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input type="password" formControlName="password" autocomplete="current-password" required />
        </label>
        @if (needsOtp()) {
          <label>
            Authenticator code
            <input inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="otpCode" />
            <span class="hint">The 6-digit code from your authenticator app.</span>
          </label>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="busy() || form.invalid">Sign in</button>
      </form>

      @if (providers().length > 0) {
        <div class="stack" aria-label="Sign in with another account">
          <p class="muted center">or continue with</p>
          @for (p of providers(); track p) {
            <a class="button secondary" [href]="auth.externalLoginUrl(p)">{{ providerName(p) }}</a>
          }
        </div>
      }

      <p class="center">
        <a routerLink="/forgot-password">Forgot your password?</a><br />
        New here? <a routerLink="/register">Create an account</a>
      </p>
    </section>
  `,
})
export class Login implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Bound from the ?returnUrl query parameter. */
  readonly returnUrl = input<string>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly needsOtp = signal(false);
  protected readonly providers = signal<string[]>([]);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    otpCode: [''],
  });

  ngOnInit(): void {
    this.auth.externalProviders().subscribe({ next: (p) => this.providers.set(p), error: () => undefined });
  }

  protected providerName(provider: string): string {
    const names: Record<string, string> = { google: 'Google', facebook: 'Facebook', microsoft: 'Microsoft', github: 'GitHub' };
    return names[provider] ?? provider;
  }

  protected submit(): void {
    if (this.form.invalid) return;
    const { email, password, otpCode } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.auth.login(email, password, otpCode).subscribe({
      next: () => {
        this.busy.set(false);
        const target = this.returnUrl();
        void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/');
      },
      error: (e) => {
        this.busy.set(false);
        if (apiError(e).code === 'otp_required') this.needsOtp.set(true);
        this.error.set(errorMessage(e));
      },
    });
  }
}
