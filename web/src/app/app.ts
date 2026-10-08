import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="app-header">
      <a class="brand" routerLink="/" aria-label="Indilingo home">Indilingo</a>
      <nav aria-label="Main">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Learn</a>
        @if (auth.hasRole('Reviewer', 'Admin')) {
          <a routerLink="/review" routerLinkActive="active">Review</a>
        }
        @if (auth.hasRole('Admin')) {
          <a routerLink="/admin" routerLinkActive="active">Admin</a>
        }
        <a routerLink="/design" routerLinkActive="active">Design</a>
      </nav>
      <div class="header-actions">
        <button type="button" class="ghost" (click)="theme.cycle()" [attr.aria-label]="'Theme: ' + theme.choice() + '. Change theme'">
          {{ theme.choice() }}
        </button>
        @if (auth.isAuthenticated()) {
          <a routerLink="/settings" class="ghost">{{ auth.isGuest() ? 'Guest' : auth.user()?.displayName }}</a>
          <button type="button" class="ghost" (click)="signOut()">Sign out</button>
        } @else {
          <a routerLink="/login" class="ghost">Sign in</a>
        }
      </div>
    </header>
    <main id="main"><router-outlet /></main>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
