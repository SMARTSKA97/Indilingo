import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from './models';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email and password do not match.',
  locked_out: 'Too many attempts. Please wait a few minutes and try again.',
  otp_required: 'Enter the 6-digit code from your authenticator app.',
  invalid_otp: 'That code is not right. Check your authenticator app and try again.',
  email_taken: 'An account with that email already exists. Try signing in instead.',
  weak_password: 'Choose a longer password with letters and numbers.',
  invalid_invite: 'This invitation is not valid any more. Ask for a new one.',
  invalid_token: 'This link has expired or was already used.',
  not_guest: 'Only guest accounts can be upgraded.',
  two_factor_required: 'Turn on two-factor authentication in Settings to use admin tools.',
};

export function apiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as Partial<ApiError> | null;
    if (body && typeof body.code === 'string') return { code: body.code, message: body.message };
    if (error.status === 0) return { code: 'offline', message: 'Cannot reach the server. Check your connection.' };
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' };
}

export function errorMessage(error: unknown): string {
  const e = apiError(error);
  return MESSAGES[e.code] ?? e.message ?? 'Something went wrong. Please try again.';
}
