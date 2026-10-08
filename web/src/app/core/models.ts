export type Role = 'Learner' | 'Reviewer' | 'Admin';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  roles: Role[];
  isGuest: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  countryCode?: string;
  birthYear?: number;
  learnerProfile?: string;
}

export interface ApiError {
  code: string;
  message?: string;
}

export interface TwoFactorSetup {
  sharedKey: string;
  otpAuthUri: string;
}
