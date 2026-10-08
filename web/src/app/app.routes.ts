import { Routes } from '@angular/router';
import { authGuard, guestOnlyGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home), title: 'Indilingo' },
  { path: 'login', canActivate: [guestOnlyGuard], loadComponent: () => import('./pages/login').then((m) => m.Login), title: 'Sign in · Indilingo' },
  { path: 'register', canActivate: [guestOnlyGuard], loadComponent: () => import('./pages/register').then((m) => m.Register), title: 'Create account · Indilingo' },
  { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password').then((m) => m.ForgotPassword), title: 'Forgot password · Indilingo' },
  { path: 'reset-password', loadComponent: () => import('./pages/reset-password').then((m) => m.ResetPassword), title: 'Reset password · Indilingo' },
  { path: 'accept-invite', loadComponent: () => import('./pages/accept-invite').then((m) => m.AcceptInvite), title: 'Accept invitation · Indilingo' },
  { path: 'auth/callback', loadComponent: () => import('./pages/auth-callback').then((m) => m.AuthCallback), title: 'Signing in · Indilingo' },
  { path: 'settings', canActivate: [authGuard], loadComponent: () => import('./pages/settings').then((m) => m.Settings), title: 'Settings · Indilingo' },
  { path: 'review', canActivate: [roleGuard('Reviewer', 'Admin')], loadComponent: () => import('./pages/review').then((m) => m.Review), title: 'Review · Indilingo' },
  { path: 'admin', canActivate: [roleGuard('Admin')], loadComponent: () => import('./pages/admin').then((m) => m.Admin), title: 'Admin · Indilingo' },
  { path: 'design', loadComponent: () => import('./pages/design').then((m) => m.Design), title: 'Design system · Indilingo' },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound), title: 'Not found · Indilingo' },
];
