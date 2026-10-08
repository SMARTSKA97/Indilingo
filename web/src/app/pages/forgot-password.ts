import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card narrow stack">
      <h1>Forgot your password?</h1>
      @if (sent()) {
        <p class="notice" role="status">
          If an account exists for that email, a reset link is on its way. It can take a few minutes to arrive.
        </p>
      } @else {
        <p class="muted">Enter your email and we will send you a link to choose a new password.</p>
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <label>
            Email
            <input type="email" formControlName="email" autocomplete="email" required />
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="busy() || form.invalid">Send reset link</button>
        </form>
      }
      <p class="center"><a routerLink="/login">Back to sign in</a></p>
    </section>
  `,
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });

  protected submit(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    // The API answers the same way whether or not the account exists, so this page never reveals which emails are registered.
    this.auth.forgotPassword(this.form.getRawValue().email).subscribe({
      next: () => {
        this.busy.set(false);
        this.sent.set(true);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
