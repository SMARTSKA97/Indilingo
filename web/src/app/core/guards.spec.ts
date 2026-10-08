import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { authGuard, guestOnlyGuard, roleGuard } from './guards';
import { fakeUser, signIn } from './testing';

describe('route guards', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: Router;

  const run = (guard: ReturnType<typeof roleGuard>, url = '/target') =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  const path = (result: unknown) => router.serializeUrl(result as UrlTree);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('sends anonymous visitors to login and remembers where they were going', () => {
    expect(path(run(authGuard, '/settings'))).toBe('/login?returnUrl=%2Fsettings');
  });

  it('lets any signed-in user through authGuard', () => {
    signIn(auth, http);
    expect(run(authGuard)).toBe(true);
  });

  it('lets a reviewer open the review screen but not admin', () => {
    signIn(auth, http, fakeUser(['Reviewer']));
    expect(run(roleGuard('Reviewer', 'Admin'))).toBe(true);
    expect(path(run(roleGuard('Admin')))).toBe('/');
  });

  it('keeps learners out of reviewer pages', () => {
    signIn(auth, http, fakeUser(['Learner']));
    expect(path(run(roleGuard('Reviewer', 'Admin')))).toBe('/');
  });

  it('sends an admin without two-factor to settings', () => {
    signIn(auth, http, fakeUser(['Admin'], { twoFactorEnabled: false }));
    expect(path(run(roleGuard('Admin')))).toBe('/settings?need2fa=1');
  });

  it('lets an admin with two-factor into admin tools', () => {
    signIn(auth, http, fakeUser(['Admin'], { twoFactorEnabled: true }));
    expect(run(roleGuard('Admin'))).toBe(true);
  });

  it('does not require two-factor for a reviewer', () => {
    signIn(auth, http, fakeUser(['Reviewer'], { twoFactorEnabled: false }));
    expect(run(roleGuard('Reviewer', 'Admin'))).toBe(true);
  });

  it('keeps full accounts off the login page but lets guests through', () => {
    signIn(auth, http, fakeUser(['Learner']));
    expect(path(run(guestOnlyGuard))).toBe('/');
    auth.clear();
    auth.startAsGuest().subscribe();
    http.expectOne('/api/auth/guest').flush({
      accessToken: 'g', refreshToken: 'g', expiresIn: 900, user: fakeUser(['Learner'], { isGuest: true, email: null }),
    });
    expect(run(guestOnlyGuard)).toBe(true);
  });
});
