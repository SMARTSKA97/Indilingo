import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';

@Component({
  selector: 'app-accept-invite',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card narrow stack">
      <h1>Accept your invitation</h1>
      @if (!token()) {
        <p class="error" role="alert">This invitation link is incomplete. Open the link from your email again.</p>
      } @else {
        <p class="muted">Choose a name and password to set up your reviewer or admin account.</p>
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <label>
            Display name
            <input formControlName="displayName" autocomplete="nickname" maxlength="40" required />
          </label>
          <label>
            Password
            <input type="password" formControlName="password" autocomplete="new-password" minlength="8" required />
            <span class="hint">At least 8 characters, with a letter and a number.</span>
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="busy() || form.invalid">Create my account</button>
        </form>
      }
    </section>
  `,
})
export class AcceptInvite {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Bound from the ?token query parameter. */
  readonly token = input<string>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(40)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected submit(): void {
    const token = this.token();
    if (this.form.invalid || !token) return;
    const { displayName, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.auth.acceptInvite(token, password, displayName.trim()).subscribe({
      next: (user) => {
        this.busy.set(false);
        // Admins must turn on two-factor authentication before using admin tools.
        void this.router.navigate(user.roles.includes('Admin') ? ['/settings'] : ['/review'], {
          queryParams: user.roles.includes('Admin') ? { need2fa: 1 } : {},
        });
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
