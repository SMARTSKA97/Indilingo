import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { fakeAuth, fakeUser, signIn } from './testing';

describe('authInterceptor', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
  });

  it('adds the bearer token to API calls', () => {
    signIn(auth, http);
    client.get('/api/me').subscribe();
    const request = http.expectOne('/api/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush({});
  });

  it('does not send the token to other hosts', () => {
    signIn(auth, http);
    client.get('https://example.com/data').subscribe();
    const request = http.expectOne('https://example.com/data');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('refreshes once on 401 and retries with the new token', () => {
    signIn(auth, http);
    let result: unknown;
    client.get('/api/me').subscribe((r) => (result = r));

    http.expectOne('/api/me').flush({ code: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/auth/refresh').flush(fakeAuth(fakeUser(), 'access-2', 'refresh-2'));

    const retry = http.expectOne('/api/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('signs out and goes to login when the refresh fails', async () => {
    signIn(auth, http);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    let failed = false;
    client.get('/api/me').subscribe({ error: () => (failed = true) });

    http.expectOne('/api/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/auth/refresh').flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('does not try to refresh a failed login', () => {
    let status = 0;
    client.post('/api/auth/login', {}).subscribe({ error: (e) => (status = e.status) });
    http.expectOne('/api/auth/login').flush({ code: 'invalid_credentials' }, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    http.expectNone('/api/auth/refresh');
  });
});
