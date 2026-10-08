import { InjectionToken } from '@angular/core';

/** Runtime configuration, set in /config.js so deployments and the Android shell can change it without a rebuild. */
export interface IndilingoConfig {
  apiBaseUrl: string;
}

declare global {
  interface Window {
    INDILINGO_CONFIG?: Partial<IndilingoConfig>;
  }
}

export function readConfig(): IndilingoConfig {
  const fromWindow = typeof window === 'undefined' ? undefined : window.INDILINGO_CONFIG;
  return { apiBaseUrl: (fromWindow?.apiBaseUrl ?? '/api').replace(/\/+$/, '') };
}

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => readConfig().apiBaseUrl,
});
