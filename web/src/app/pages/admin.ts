import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE_URL } from '../core/config';
import { errorMessage } from '../core/errors';

interface Invite {
  id: string;
  email: string;
  role: 'Reviewer' | 'Admin';
  expiresAt: string;
  acceptedAt: string | null;
}

@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <h1>Admin</h1>
      <p class="muted">
        Reviewer and admin accounts exist only by invitation. The content studio (courses, units, chapters and lessons)
        arrives in phase 3.
      </p>

      <section class="card stack" aria-labelledby="invite-h">
        <h2 id="invite-h">Invite someone</h2>
        <form class="stack" [formGroup]="form" (ngSubmit)="invite()">
          <label>
            Email
            <input type="email" formControlName="email" required />
          </label>
          <label>
            Role
            <select formControlName="role">
              <option value="Reviewer">Reviewer (can open the review screen only)</option>
              <option value="Admin">Admin (can add content and invite others)</option>
            </select>
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          @if (sentTo()) {
            <p class="notice" role="status">Invitation sent to {{ sentTo() }}. The link works for 7 days.</p>
          }
          <button type="submit" [disabled]="busy() || form.invalid">Send invitation</button>
        </form>
      </section>

      <section class="card stack" aria-labelledby="list-h">
        <h2 id="list-h">Invitations</h2>
        @if (invites().length === 0) {
          <p class="muted">No invitations yet.</p>
        } @else {
          <ul>
            @for (i of invites(); track i.id) {
              <li>
                {{ i.email }} · {{ i.role }} ·
                @if (i.acceptedAt) {
                  accepted {{ i.acceptedAt | date: 'mediumDate' }}
                } @else {
                  expires {{ i.expiresAt | date: 'mediumDate' }}
                }
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class Admin implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly invites = signal<Invite[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly sentTo = signal('');

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['Reviewer' as Invite['role']],
  });

  ngOnInit(): void {
    this.load();
  }

  protected invite(): void {
    if (this.form.invalid) return;
    const { email, role } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.sentTo.set('');
    this.http.post(`${this.base}/admin/invites`, { email: email.trim(), role }).subscribe({
      next: () => {
        this.busy.set(false);
        this.sentTo.set(email.trim());
        this.form.controls.email.reset('');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  private load(): void {
    this.http.get<Invite[]>(`${this.base}/admin/invites`).subscribe({
      next: (list) => this.invites.set(list),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}
