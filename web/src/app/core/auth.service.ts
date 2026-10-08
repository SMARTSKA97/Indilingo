import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { API_BASE_URL } from './config';
import { AuthResponse, RegisterRequest, Role, TwoFactorSetup, User } from './models';

const STORAGE_KEY = 'indilingo.auth';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private readonly session = signal<StoredSession | null>(this.load());
  private refreshInFlight$: Observable<AuthResponse> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isGuest = computed(() => this.session()?.user.isGuest ?? false);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  hasRole(...roles: Role[]): boolean {
    const user = this.user();
    return !!user && roles.some((r) => user.roles.includes(r));
  }

  login(email: string, password: string, otpCode?: string): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/login`, { email, password, otpCode: otpCode || undefined })
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  register(request: RegisterRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/register`, request)
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  startAsGuest(): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/guest`, {})
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  /** Turns the current guest into a full account, keeping their progress. */
  upgradeGuest(request: RegisterRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/guest/upgrade`, request)
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  acceptInvite(token: string, password: string, displayName: string): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/accept-invite`, { token, password, displayName })
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  exchangeExternalCode(code: string): Observable<User> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/external/exchange`, { code })
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  externalProviders(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/auth/providers`);
  }

  externalLoginUrl(provider: string): string {
    const returnUrl = encodeURIComponent(`${window.location.origin}/auth/callback`);
    return `${this.base}/auth/external/${provider}?returnUrl=${returnUrl}`;
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/forgot-password`, { email });
  }

  resetPassword(email: string, token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/reset-password`, { email, token, newPassword });
  }

  setupTwoFactor(): Observable<TwoFactorSetup> {
    return this.http.post<TwoFactorSetup>(`${this.base}/auth/2fa/setup`, {});
  }

  enableTwoFactor(code: string): Observable<{ recoveryCodes: string[] }> {
    return this.http.post<{ recoveryCodes: string[] }>(`${this.base}/auth/2fa/enable`, { code }).pipe(
      tap(() => this.patchUser({ twoFactorEnabled: true })),
    );
  }

  disableTwoFactor(password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/2fa/disable`, { password }).pipe(
      tap(() => this.patchUser({ twoFactorEnabled: false })),
    );
  }

  /** Exchanges the refresh token for new tokens. Concurrent callers share one request. */
  refresh(): Observable<AuthResponse> {
    const current = this.session();
    if (!current) throw new Error('Not signed in');
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http
        .post<AuthResponse>(`${this.base}/auth/refresh`, { refreshToken: current.refreshToken })
        .pipe(
          tap((r) => this.store(r)),
          finalize(() => (this.refreshInFlight$ = null)),
          shareReplay(1),
        );
    }
    return this.refreshInFlight$;
  }

  logout(): void {
    const current = this.session();
    if (current) {
      // Best effort: revoke the refresh token on the server, never block sign-out on it.
      this.http.post(`${this.base}/auth/logout`, { refreshToken: current.refreshToken }).subscribe({ error: () => undefined });
    }
    this.clear();
  }

  /** Drops the local session without calling the server (used when a refresh fails). */
  clear(): void {
    this.session.set(null);
    this.safeStorage()?.removeItem(STORAGE_KEY);
  }

  private patchUser(patch: Partial<User>): void {
    const current = this.session();
    if (!current) return;
    this.persist({ ...current, user: { ...current.user, ...patch } });
  }

  private store(response: AuthResponse): void {
    this.persist({ accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user });
  }

  private persist(session: StoredSession): void {
    this.session.set(session);
    this.safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  private load(): StoredSession | null {
    try {
      const raw = this.safeStorage()?.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  private safeStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }
}
