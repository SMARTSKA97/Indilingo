import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { RegisterRequest } from '../core/models';

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NP', name: 'Nepal' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ZZ', name: 'Somewhere else' },
];

export const LEARNER_PROFILES = [
  { value: 'beginner', label: 'Complete beginner' },
  { value: 'heritage', label: 'Heritage learner (family speaks it)' },
  { value: 'travel', label: 'Learning for travel or work' },
  { value: 'refresh', label: 'Refreshing what I knew' },
];

/** Builds a request from the shared account form, dropping empty optional fields. */
export function toRegisterRequest(v: {
  displayName: string; email: string; password: string; countryCode: string; birthYear: number | null; learnerProfile: string;
}): RegisterRequest {
  return {
    displayName: v.displayName.trim(),
    email: v.email.trim(),
    password: v.password,
    countryCode: v.countryCode || undefined,
    birthYear: v.birthYear ?? undefined,
    learnerProfile: v.learnerProfile || undefined,
  };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card narrow stack">
      <h1>Create your account</h1>
      <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
        <label>
          Display name
          <input formControlName="displayName" autocomplete="nickname" maxlength="40" required />
          <span class="hint">Shown on leaderboards later. Not your email.</span>
        </label>
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input type="password" formControlName="password" autocomplete="new-password" minlength="8" required />
          <span class="hint">At least 8 characters, with a letter and a number.</span>
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
          Birth year (optional)
          <input type="number" formControlName="birthYear" min="1900" [max]="thisYear" inputmode="numeric" />
          <span class="hint">Used for age-group leaderboards and stats.</span>
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
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="busy() || form.invalid">Create account</button>
      </form>
      <p class="center">Already have an account? <a routerLink="/login">Sign in</a></p>
    </section>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly countries = COUNTRIES;
  protected readonly profiles = LEARNER_PROFILES;
  protected readonly thisYear = new Date().getFullYear();
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(40)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    countryCode: [''],
    birthYear: [null as number | null, [Validators.min(1900), Validators.max(new Date().getFullYear())]],
    learnerProfile: [''],
  });

  protected submit(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.register(toRegisterRequest(this.form.getRawValue())).subscribe({
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
