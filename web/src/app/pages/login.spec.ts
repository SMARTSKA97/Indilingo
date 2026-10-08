import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAuth, fakeUser } from '../core/testing';
import { Login } from './login';

describe('Login page', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  function open() {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush(['google', 'github']);
    fixture.detectChanges();
    return fixture;
  }

  function fill(root: HTMLElement, email: string, password: string) {
    const [emailInput, passwordInput] = Array.from(root.querySelectorAll('input'));
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  it('lists the social providers the server offers', () => {
    const root = open().nativeElement as HTMLElement;
    const links = Array.from(root.querySelectorAll('a.button')).map((a) => a.textContent?.trim());
    expect(links).toEqual(['Google', 'GitHub']);
  });

  it('keeps the button disabled until the form is valid', () => {
    const fixture = open();
    const root = fixture.nativeElement as HTMLElement;
    const submit = root.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fill(root, 'a@example.com', 'pw');
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('asks for the authenticator code when the server requires it', () => {
    const fixture = open();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'a@example.com', 'pw');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ code: 'otp_required' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(root.textContent).toContain('Authenticator code');
    expect(root.querySelector('[role=alert]')?.textContent).toContain('6-digit code');
  });

  it('shows a friendly message for wrong credentials', () => {
    const fixture = open();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'a@example.com', 'wrong');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ code: 'invalid_credentials' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(root.querySelector('[role=alert]')?.textContent).toContain('do not match');
  });

  it('goes home after a successful sign-in', () => {
    const fixture = open();
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'a@example.com', 'pw');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush(fakeAuth(fakeUser()));
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('only follows return URLs that stay inside the app', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentRef.setInput('returnUrl', 'https://evil.example.com');
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush([]);
    fixture.detectChanges();
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'a@example.com', 'pw');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush(fakeAuth(fakeUser()));
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});
