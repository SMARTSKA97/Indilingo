import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from '../core/theme.service';
import { Tigris } from './tigris';

describe('Tigris', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function render(state: string, animate = true) {
    const fixture = TestBed.createComponent(Tigris);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('animate', animate);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('describes itself for screen readers', () => {
    const svg = render('idle').querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Tigris the tiger, waiting');
  });

  it('renders each state', () => {
    expect(render('talking').querySelector('.mouth-open')).not.toBeNull();
    expect(render('cheer').querySelector('.sparkles')).not.toBeNull();
    expect(render('sad').querySelector('.brows')).not.toBeNull();
    expect(render('idle').querySelector('.sparkles')).toBeNull();
    expect(render('idle').querySelector('.mouth-open')).toBeNull();
  });

  it('exposes the state for styling and labels it', () => {
    const svg = render('cheer').querySelector('svg')!;
    expect(svg.getAttribute('data-state')).toBe('cheer');
    expect(svg.getAttribute('aria-label')).toContain('cheering');
  });

  it('animates by default', () => {
    expect(render('idle').querySelector('svg')!.classList.contains('animated')).toBe(true);
  });

  it('stays still when animation is turned off on the component', () => {
    expect(render('idle', false).querySelector('svg')!.classList.contains('animated')).toBe(false);
  });

  it('stays still when the learner chose reduced motion', () => {
    TestBed.inject(ThemeService).reduceMotionOverride.set(true);
    expect(render('talking').querySelector('svg')!.classList.contains('animated')).toBe(false);
  });
});
