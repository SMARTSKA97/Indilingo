import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE_URL } from './config';

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/guest', '/auth/accept-invite', '/auth/external/exchange'];

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/** Adds the bearer token to API calls and retries once after a silent refresh on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const base = inject(API_BASE_URL);

  const isApi = req.url.startsWith(base);
  const isAuthCall = AUTH_PATHS.some((p) => req.url.startsWith(`${base}${p}`));
  if (!isApi) return next(req);

  return next(withToken(req, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthCall || !auth.isAuthenticated()) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        switchMap((r) => next(withToken(req, r.accessToken))),
        catchError((refreshError: unknown) => {
          auth.clear();
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
