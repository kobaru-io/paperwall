// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { showBadge, removeBadge } from '../src/badge';

describe('showBadge', () => {
  afterEach(() => {
    removeBadge();
  });

  it('creates a DOM element with id="paperwall-badge"', () => {
    showBadge();
    const badge = document.getElementById('paperwall-badge');
    expect(badge).not.toBeNull();
  });

  it('badge has fixed positioning', () => {
    showBadge();
    const badge = document.getElementById('paperwall-badge')!;
    const style = window.getComputedStyle(badge);
    expect(style.position).toBe('fixed');
  });

  it('badge is positioned at bottom-right', () => {
    showBadge();
    const badge = document.getElementById('paperwall-badge')!;
    const style = window.getComputedStyle(badge);
    expect(style.bottom).toBeTruthy();
    expect(style.right).toBeTruthy();
  });

  it('injects a <style> tag for badge CSS', () => {
    showBadge();
    const styleTag = document.getElementById('paperwall-badge-style');
    expect(styleTag).not.toBeNull();
    expect(styleTag!.tagName.toLowerCase()).toBe('style');
  });

  it('calling showBadge() twice does not duplicate the badge', () => {
    showBadge();
    showBadge();
    const badges = document.querySelectorAll('#paperwall-badge');
    expect(badges.length).toBe(1);
  });
});

describe('removeBadge', () => {
  it('removes the badge element', () => {
    showBadge();
    expect(document.getElementById('paperwall-badge')).not.toBeNull();

    removeBadge();
    expect(document.getElementById('paperwall-badge')).toBeNull();
  });

  it('removes the style tag', () => {
    showBadge();
    expect(document.getElementById('paperwall-badge-style')).not.toBeNull();

    removeBadge();
    expect(document.getElementById('paperwall-badge-style')).toBeNull();
  });

  it('does not throw when no badge exists', () => {
    expect(() => removeBadge()).not.toThrow();
  });
});
