import { HttpTestingController } from '@angular/common/http/testing';
import { AuthResponse, Role, User } from './models';
import { AuthService } from './auth.service';

export function fakeUser(roles: Role[] = ['Learner'], over: Partial<User> = {}): User {
  return { id: 'u1', email: 'a@example.com', displayName: 'Asha', roles, isGuest: false, twoFactorEnabled: false, ...over };
}

export function fakeAuth(user: User, accessToken = 'access-1', refreshToken = 'refresh-1'): AuthResponse {
  return { accessToken, refreshToken, expiresIn: 900, user };
}

/** Signs in through the real service so state and storage match production behaviour. */
export function signIn(auth: AuthService, http: HttpTestingController, user: User = fakeUser(), tokens?: [string, string]): void {
  auth.login(user.email ?? 'a@example.com', 'pw').subscribe();
  http.expectOne('/api/auth/login').flush(fakeAuth(user, tokens?.[0], tokens?.[1]));
}
