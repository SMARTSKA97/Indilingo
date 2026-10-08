import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { TwoFactorSetup } from '../core/models';
import { ThemeService } from '../core/theme.service';
import { COUNTRIES, LEARNER_PROFILES, toRegisterRequest } from './register';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <h1>Settings</h1>

      @if (need2fa()) {
        <p class="notice" role="status">
          Admin tools need two-factor authentication. Turn it on below, then open Admin again.
        </p>
      }

      @if (auth.isGuest()) {
        <section class="card stack" aria-labelledby="upgrade-h">
          <h2 id="upgrade-h">Keep your progress</h2>
          <p class="muted">You are a guest. Create an account and everything you have done so far moves with you.</p>
          <form class="stack" [formGroup]="upgradeForm" (ngSubmit)="upgrade()">
            <label>Display name <input formControlName="displayName" maxlength="40" required /></label>
            <label>Email <input type="email" formControlName="email" autocomplete="email" required /></label>
            <label>
              Password
              <input type="password" formControlName="password" autocomplete="new-password" minlength="8" required />
            </label>
            <label>
              Country
              <select formControlName="countryCode">
                <option value="">Prefer not to say</option>
                @for (c of countries; track c.code) {
                  <option [value]="c.code">{{ c.name }}</option>
                }
              </select>
            </label>
            <label>
              About you
              <select formControlName="learnerProfile">
                <option value="">Prefer not to say</option>
                @for (p of profiles; track p.value) {
                  <option [value]="p.value">{{ p.label }}</option>
                }
              </select>
            </label>
            @if (upgradeError()) {
              <p class="error" role="alert">{{ upgradeError() }}</p>
            }
            <button type="submit" [disabled]="upgradeBusy() || upgradeForm.invalid">Create account</button>
          </form>
        </section>
      } @else {
        <section class="card stack" aria-labelledby="account-h">
          <h2 id="account-h">Account</h2>
          <p>
            <strong>{{ auth.user()?.displayName }}</strong><br />
            <span class="muted">{{ auth.user()?.email }}</span>
          </p>
          <p class="muted">Role: {{ auth.user()?.roles?.join(', ') }}</p>
        </section>

        <section class="card stack" aria-labelledby="mfa-h">
          <h2 id="mfa-h">Two-factor authentication</h2>
          @if (auth.user()?.twoFactorEnabled) {
            <p>Two-factor authentication is <strong>on</strong>.</p>
            @if (!auth.hasRole('Admin')) {
              <form class="stack" [formGroup]="disableForm" (ngSubmit)="disable()">
                <label>Confirm your password <input type="password" formControlName="password" autocomplete="current-password" /></label>
                <button type="submit" class="secondary" [disabled]="disableForm.invalid || mfaBusy()">Turn off</button>
              </form>
            } @else {
              <p class="muted">Admin accounts must keep two-factor authentication on.</p>
            }
          } @else if (setup()) {
            <p>Add this key to an authenticator app (Google Authenticator, Authy, 1Password and similar), then enter the 6-digit code.</p>
            <p><code class="key">{{ setup()?.sharedKey }}</code></p>
            <p class="hint">Or open on this device: <a [href]="setup()?.otpAuthUri">add to authenticator</a></p>
            <form class="stack" [formGroup]="enableForm" (ngSubmit)="enable()">
              <label>
                Code
                <input inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="code" />
              </label>
              <button type="submit" [disabled]="enableForm.invalid || mfaBusy()">Turn on</button>
            </form>
          } @else {
            <p class="muted">Add a second step to sign-in with an authenticator app.</p>
            <button type="button" (click)="startSetup()" [disabled]="mfaBusy()">Set up</button>
          }
          @if (recoveryCodes().length) {
            <div class="notice" role="status">
              <strong>Save these recovery codes.</strong> Each works once if you lose your authenticator. They will not be shown again.
              <pre>{{ recoveryCodes().join('\\n') }}</pre>
            </div>
          }
          @if (mfaError()) {
            <p class="error" role="alert">{{ mfaError() }}</p>
          }
        </section>
      }

      <section class="card stack" aria-labelledby="look-h">
        <h2 id="look-h">Appearance</h2>
        <div class="row">
          <button type="button" class="secondary" (click)="theme.cycle()">Theme: {{ theme.choice() }}</button>
          <label class="row">
            <input type="checkbox" [checked]="theme.prefersReducedMotion()" (change)="toggleMotion($event)" style="width: auto" />
            Reduce motion
          </label>
        </div>
      </section>
    </div>
  `,
  styles: `
    .key { font-size: 1.1rem; letter-spacing: 0.08em; word-break: break-all; background: var(--color-surface-2); padding: 6px 10px; border-radius: 8px; }
    pre { margin: 8px 0 0; white-space: pre-wrap; }
  `,
})
export class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Bound from ?need2fa=1 when an admin was sent here to turn on two-factor authentication. */
  readonly need2fa = input<string | undefined>();

  protected readonly countries = COUNTRIES;
  protected readonly profiles = LEARNER_PROFILES;

  protected readonly upgradeBusy = signal(false);
  protected readonly upgradeError = signal('');
  protected readonly upgradeForm = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(40)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    countryCode: [''],
    learnerProfile: [''],
  });

  protected readonly setup = signal<TwoFactorSetup | null>(null);
  protected readonly recoveryCodes = signal<string[]>([]);
  protected readonly mfaBusy = signal(false);
  protected readonly mfaError = signal('');
  protected readonly enableForm = this.fb.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  protected readonly disableForm = this.fb.group({ password: ['', Validators.required] });

  protected upgrade(): void {
    if (this.upgradeForm.invalid) return;
    this.upgradeBusy.set(true);
    this.upgradeError.set('');
    const v = this.upgradeForm.getRawValue();
    this.auth.upgradeGuest(toRegisterRequest({ ...v, birthYear: null })).subscribe({
      next: () => this.upgradeBusy.set(false),
      error: (e) => {
        this.upgradeBusy.set(false);
        this.upgradeError.set(errorMessage(e));
      },
    });
  }

  protected startSetup(): void {
    this.mfaBusy.set(true);
    this.mfaError.set('');
    this.auth.setupTwoFactor().subscribe({
      next: (s) => {
        this.setup.set(s);
        this.mfaBusy.set(false);
      },
      error: (e) => {
        this.mfaBusy.set(false);
        this.mfaError.set(errorMessage(e));
      },
    });
  }

  protected enable(): void {
    if (this.enableForm.invalid) return;
    this.mfaBusy.set(true);
    this.mfaError.set('');
    this.auth.enableTwoFactor(this.enableForm.getRawValue().code).subscribe({
      next: (r) => {
        this.recoveryCodes.set(r.recoveryCodes);
        this.setup.set(null);
        this.mfaBusy.set(false);
      },
      error: (e) => {
        this.mfaBusy.set(false);
        this.mfaError.set(errorMessage(e));
      },
    });
  }

  protected disable(): void {
    if (this.disableForm.invalid) return;
    this.mfaBusy.set(true);
    this.mfaError.set('');
    this.auth.disableTwoFactor(this.disableForm.getRawValue().password).subscribe({
      next: () => {
        this.mfaBusy.set(false);
        this.disableForm.reset();
      },
      error: (e) => {
        this.mfaBusy.set(false);
        this.mfaError.set(errorMessage(e));
      },
    });
  }

  protected toggleMotion(event: Event): void {
    this.theme.reduceMotionOverride.set((event.target as HTMLInputElement).checked);
  }
}
