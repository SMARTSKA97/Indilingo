import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/** Any signed-in user, guests included. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** A signed-in user holding one of the given roles. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    if (!auth.hasRole(...roles)) return router.createUrlTree(['/']);
    // Admins must have two-factor authentication on; the API enforces this too.
    if (roles.includes('Admin') && auth.hasRole('Admin') && !auth.user()?.twoFactorEnabled) {
      return router.createUrlTree(['/settings'], { queryParams: { need2fa: 1 } });
    }
    return true;
  };
}

/** Keeps signed-in users away from the login and register pages. */
export const guestOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() && !auth.isGuest() ? router.createUrlTree(['/']) : true;
};
