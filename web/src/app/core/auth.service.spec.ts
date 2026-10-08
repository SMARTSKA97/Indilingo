import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { fakeAuth, fakeUser, signIn } from './testing';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts signed out', () => {
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(auth.accessToken()).toBeNull();
  });

  it('signs in, exposes the user and stores the session', () => {
    signIn(auth, http, fakeUser(['Learner']));
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.displayName).toBe('Asha');
    expect(auth.accessToken()).toBe('access-1');
    expect(JSON.parse(localStorage.getItem('indilingo.auth')!).refreshToken).toBe('refresh-1');
  });

  it('sends the one-time code only when given', () => {
    auth.login('a@example.com', 'pw').subscribe();
    const first = http.expectOne('/api/auth/login');
    expect(first.request.body.otpCode).toBeUndefined();
    first.flush(fakeAuth(fakeUser()));

    auth.login('a@example.com', 'pw', '123456').subscribe();
    const second = http.expectOne('/api/auth/login');
    expect(second.request.body.otpCode).toBe('123456');
    second.flush(fakeAuth(fakeUser()));
  });

  it('restores a saved session on start', () => {
    signIn(auth, http, fakeUser(['Admin'], { twoFactorEnabled: true }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const restored = TestBed.inject(AuthService);
    expect(restored.isAuthenticated()).toBe(true);
    expect(restored.hasRole('Admin')).toBe(true);
  });

  it('ignores a corrupt saved session', () => {
    localStorage.setItem('indilingo.auth', '{not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });

  it('checks roles', () => {
    signIn(auth, http, fakeUser(['Reviewer']));
    expect(auth.hasRole('Reviewer')).toBe(true);
    expect(auth.hasRole('Admin')).toBe(false);
    expect(auth.hasRole('Admin', 'Reviewer')).toBe(true);
  });

  it('marks a guest session', () => {
    auth.startAsGuest().subscribe();
    http.expectOne('/api/auth/guest').flush(fakeAuth(fakeUser(['Learner'], { isGuest: true, email: null })));
    expect(auth.isGuest()).toBe(true);
  });

  it('upgrading a guest replaces the session with the full account', () => {
    auth.startAsGuest().subscribe();
    http.expectOne('/api/auth/guest').flush(fakeAuth(fakeUser(['Learner'], { isGuest: true, email: null })));
    auth.upgradeGuest({ email: 'a@example.com', password: 'Passw0rd!', displayName: 'Asha' }).subscribe();
    http.expectOne('/api/auth/guest/upgrade').flush(fakeAuth(fakeUser(['Learner']), 'access-2', 'refresh-2'));
    expect(auth.isGuest()).toBe(false);
    expect(auth.accessToken()).toBe('access-2');
  });

  it('shares one refresh request between concurrent callers', () => {
    signIn(auth, http);
    auth.refresh().subscribe();
    auth.refresh().subscribe();
    const requests = http.match('/api/auth/refresh');
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body).toEqual({ refreshToken: 'refresh-1' });
    requests[0].flush(fakeAuth(fakeUser(), 'access-2', 'refresh-2'));
    expect(auth.accessToken()).toBe('access-2');
  });

  it('turning on two-factor updates the stored user', () => {
    signIn(auth, http);
    auth.enableTwoFactor('123456').subscribe();
    http.expectOne('/api/auth/2fa/enable').flush({ recoveryCodes: ['a', 'b'] });
    expect(auth.user()?.twoFactorEnabled).toBe(true);
    expect(JSON.parse(localStorage.getItem('indilingo.auth')!).user.twoFactorEnabled).toBe(true);
  });

  it('signs out locally and revokes the token on the server', () => {
    signIn(auth, http);
    auth.logout();
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
    request.flush({});
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('indilingo.auth')).toBeNull();
  });

  it('still signs out when the server is unreachable', () => {
    signIn(auth, http);
    auth.logout();
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
    expect(auth.isAuthenticated()).toBe(false);
  });
});
