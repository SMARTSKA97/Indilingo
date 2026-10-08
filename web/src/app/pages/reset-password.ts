import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card narrow stack">
      <h1>Choose a new password</h1>
      @if (!email() || !token()) {
        <p class="error" role="alert">This reset link is incomplete. Open the link from your email again.</p>
      } @else if (done()) {
        <p class="notice" role="status">Your password has been changed.</p>
        <a class="button" routerLink="/login">Sign in</a>
      } @else {
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <label>
            New password
            <input type="password" formControlName="password" autocomplete="new-password" minlength="8" required />
            <span class="hint">At least 8 characters, with a letter and a number.</span>
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="busy() || form.invalid">Change password</button>
        </form>
      }
    </section>
  `,
})
export class ResetPassword {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Bound from the ?email and ?token query parameters. */
  readonly email = input<string>();
  readonly token = input<string>();

  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group({ password: ['', [Validators.required, Validators.minLength(8)]] });

  protected submit(): void {
    const email = this.email();
    const token = this.token();
    if (this.form.invalid || !email || !token) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.resetPassword(email, token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.set(true);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
