import { describe, it, expect } from 'vitest';
import {
  isPrivateIP,
  isAllowedPaymentScheme,
  validatePaymentOrigin,
  normalizeOrigin,
} from '../src/shared/origin-security';

// ── Tests ────────────────────────────────────────────────────────

describe('origin-security', () => {
  // ── isPrivateIP ──────────────────────────────────────────────

  describe('isPrivateIP', () => {
    describe('returns true for private/internal addresses', () => {
      it('detects localhost', () => {
        expect(isPrivateIP('localhost')).toBe(true);
      });

      it('detects 127.0.0.1 (IPv4 loopback)', () => {
        expect(isPrivateIP('127.0.0.1')).toBe(true);
      });

      it('detects ::1 (IPv6 loopback)', () => {
        expect(isPrivateIP('::1')).toBe(true);
      });

      it('detects 10.x.x.x (Class A private)', () => {
        expect(isPrivateIP('10.0.0.1')).toBe(true);
      });

      it('detects 172.16.x.x (Class B private)', () => {
        expect(isPrivateIP('172.16.0.1')).toBe(true);
      });

      it('detects 192.168.x.x (Class C private)', () => {
        expect(isPrivateIP('192.168.1.1')).toBe(true);
      });

      it('detects fe80::1 (IPv6 link-local)', () => {
        expect(isPrivateIP('fe80::1')).toBe(true);
      });

      it('detects ::ffff:127.0.0.1 (IPv4-mapped IPv6, dotted form)', () => {
        expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
      });

      it('detects ::ffff:7f00:1 (IPv4-mapped IPv6, hex form)', () => {
        expect(isPrivateIP('::ffff:7f00:1')).toBe(true);
      });

      it('detects 0.0.0.0', () => {
        expect(isPrivateIP('0.0.0.0')).toBe(true);
      });

      it('detects 169.254.x.x (link-local IPv4)', () => {
        expect(isPrivateIP('169.254.1.1')).toBe(true);
      });

      it('detects fc00:: (IPv6 unique local)', () => {
        expect(isPrivateIP('fc00::1')).toBe(true);
      });

      it('detects fd00:: (IPv6 unique local)', () => {
        expect(isPrivateIP('fd00::abc')).toBe(true);
      });

      it('detects ::ffff:c0a8:101 (IPv4-mapped 192.168.1.1, hex form)', () => {
        expect(isPrivateIP('::ffff:c0a8:101')).toBe(true);
      });

      it('detects ::ffff:192.168.1.1 (IPv4-mapped, dotted form)', () => {
        expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true);
      });

      it('detects 127.255.255.255 (loopback range end)', () => {
        expect(isPrivateIP('127.255.255.255')).toBe(true);
      });

      it('detects 172.31.255.255 (Class B private range end)', () => {
        expect(isPrivateIP('172.31.255.255')).toBe(true);
      });
    });

    describe('returns false for public addresses', () => {
      it('rejects google.com', () => {
        expect(isPrivateIP('google.com')).toBe(false);
      });

      it('rejects 8.8.8.8 (public DNS)', () => {
        expect(isPrivateIP('8.8.8.8')).toBe(false);
      });

      it('rejects 2001:db8::1 (documentation IPv6)', () => {
        expect(isPrivateIP('2001:db8::1')).toBe(false);
      });

      it('rejects example.com', () => {
        expect(isPrivateIP('example.com')).toBe(false);
      });

      it('rejects 172.32.0.1 (just outside Class B private)', () => {
        expect(isPrivateIP('172.32.0.1')).toBe(false);
      });

      it('rejects 172.15.0.1 (just below Class B private)', () => {
        expect(isPrivateIP('172.15.0.1')).toBe(false);
      });

      it('rejects 11.0.0.1 (just outside Class A private)', () => {
        expect(isPrivateIP('11.0.0.1')).toBe(false);
      });

      it('rejects 192.169.1.1 (just outside Class C private)', () => {
        expect(isPrivateIP('192.169.1.1')).toBe(false);
      });

      it('rejects empty string', () => {
        expect(isPrivateIP('')).toBe(false);
      });
    });
  });

  // ── isAllowedPaymentScheme ───────────────────────────────────

  describe('isAllowedPaymentScheme', () => {
    it('allows https:', () => {
      expect(isAllowedPaymentScheme('https:')).toBe(true);
    });

    it('blocks http:', () => {
      expect(isAllowedPaymentScheme('http:')).toBe(false);
    });

    it('blocks file:', () => {
      expect(isAllowedPaymentScheme('file:')).toBe(false);
    });

    it('blocks data:', () => {
      expect(isAllowedPaymentScheme('data:')).toBe(false);
    });

    it('blocks blob:', () => {
      expect(isAllowedPaymentScheme('blob:')).toBe(false);
    });

    it('blocks javascript:', () => {
      expect(isAllowedPaymentScheme('javascript:')).toBe(false);
    });

    it('blocks about:', () => {
      expect(isAllowedPaymentScheme('about:')).toBe(false);
    });

    it('blocks empty string', () => {
      expect(isAllowedPaymentScheme('')).toBe(false);
    });

    it('blocks ftp:', () => {
      expect(isAllowedPaymentScheme('ftp:')).toBe(false);
    });

    it('is case-sensitive (HTTPS: is rejected)', () => {
      expect(isAllowedPaymentScheme('HTTPS:')).toBe(false);
    });
  });

  // ── validatePaymentOrigin ────────────────────────────────────

  describe('validatePaymentOrigin', () => {
    describe('valid origins', () => {
      it('accepts https://example.com', () => {
        const result = validatePaymentOrigin('https://example.com');
        expect(result.valid).toBe(true);
      });

      it('accepts https://sub.domain.example.com', () => {
        const result = validatePaymentOrigin('https://sub.domain.example.com');
        expect(result.valid).toBe(true);
      });

      it('accepts https://example.com/path', () => {
        const result = validatePaymentOrigin('https://example.com/path');
        expect(result.valid).toBe(true);
      });
    });

    describe('insecure-scheme rejections', () => {
      it('rejects http://example.com', () => {
        const result = validatePaymentOrigin('http://example.com');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('insecure-scheme');
      });

      it('rejects file:///etc/passwd', () => {
        const result = validatePaymentOrigin('file:///etc/passwd');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('insecure-scheme');
      });

      it('rejects data:text/html,<h1>hi</h1>', () => {
        const result = validatePaymentOrigin('data:text/html,<h1>hi</h1>');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('insecure-scheme');
      });

      it('rejects blob:https://example.com/uuid', () => {
        const result = validatePaymentOrigin('blob:https://example.com/uuid');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('insecure-scheme');
      });
    });

    describe('private-network rejections', () => {
      it('rejects https://localhost', () => {
        const result = validatePaymentOrigin('https://localhost');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('private-network');
      });

      it('rejects https://192.168.1.1', () => {
        const result = validatePaymentOrigin('https://192.168.1.1');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('private-network');
      });

      it('rejects https://127.0.0.1', () => {
        const result = validatePaymentOrigin('https://127.0.0.1');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('private-network');
      });

      it('rejects https://10.0.0.1', () => {
        const result = validatePaymentOrigin('https://10.0.0.1');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('private-network');
      });

      it('rejects https://172.16.0.1', () => {
        const result = validatePaymentOrigin('https://172.16.0.1');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('private-network');
      });
    });

    describe('malformed rejections', () => {
      it('rejects not-a-url', () => {
        const result = validatePaymentOrigin('not-a-url');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('malformed');
      });

      it('rejects empty string', () => {
        const result = validatePaymentOrigin('');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('malformed');
      });

      it('rejects bare hostname (example.com)', () => {
        // Note: new URL('example.com') throws for some runtimes
        // but may succeed in others; the function handles both cases
        const result = validatePaymentOrigin('example.com');
        expect(result.valid).toBe(false);
      });
    });

    describe('priority: scheme checked before network', () => {
      it('http://localhost returns insecure-scheme, not private-network', () => {
        const result = validatePaymentOrigin('http://localhost');
        expect(result.valid).toBe(false);
        expect((result as { reason: string }).reason).toBe('insecure-scheme');
      });
    });
  });

  // ── normalizeOrigin ──────────────────────────────────────────

  describe('normalizeOrigin', () => {
    it('lowercases and strips trailing slash: HTTPS://Example.Com/', () => {
      expect(normalizeOrigin('HTTPS://Example.Com/')).toBe('https://example.com');
    });

    it('is idempotent: https://example.com', () => {
      expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
    });

    it('lowercases: HTTPS://FOO.BAR/', () => {
      expect(normalizeOrigin('HTTPS://FOO.BAR/')).toBe('https://foo.bar');
    });

    it('strips trailing slash only once', () => {
      expect(normalizeOrigin('https://example.com/')).toBe('https://example.com');
    });

    it('does not strip path components', () => {
      expect(normalizeOrigin('https://example.com/path')).toBe('https://example.com/path');
    });

    it('handles mixed-case path', () => {
      expect(normalizeOrigin('HTTPS://Example.Com/PATH')).toBe('https://example.com/path');
    });

    it('handles empty string', () => {
      expect(normalizeOrigin('')).toBe('');
    });
  });
});
