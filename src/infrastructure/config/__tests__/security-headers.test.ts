import { describe, expect, it } from 'vitest';
import {
  buildSecurityHeaders,
  supabaseHostFromUrl,
} from '@/src/infrastructure/config/security-headers';

function headerValue(headers: ReturnType<typeof buildSecurityHeaders>, key: string) {
  return headers.find((h) => h.key === key)?.value;
}

describe('supabaseHostFromUrl', () => {
  it('extrai o host de uma URL remota', () => {
    expect(supabaseHostFromUrl('https://abc123.supabase.co')).toBe('abc123.supabase.co');
  });
  it('ignora loopback e valores inválidos', () => {
    expect(supabaseHostFromUrl('http://127.0.0.1:54321')).toBeUndefined();
    expect(supabaseHostFromUrl('nonsense')).toBeUndefined();
    expect(supabaseHostFromUrl(undefined)).toBeUndefined();
  });
});

describe('buildSecurityHeaders', () => {
  it('inclui os headers base', () => {
    const headers = buildSecurityHeaders();
    for (const key of [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(headerValue(headers, key)).toBeTruthy();
    }
  });

  it('coloca o host do Supabase em connect-src (http e wss)', () => {
    const headers = buildSecurityHeaders({ supabaseHost: 'abc123.supabase.co' });
    const csp = headerValue(headers, 'Content-Security-Policy')!;
    expect(csp).toContain('https://abc123.supabase.co');
    expect(csp).toContain('wss://abc123.supabase.co');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("só libera 'unsafe-eval' em dev", () => {
    expect(
      buildSecurityHeaders({ isDev: false }).find((h) => h.key === 'Content-Security-Policy')!.value,
    ).not.toContain("'unsafe-eval'");
    expect(
      buildSecurityHeaders({ isDev: true }).find((h) => h.key === 'Content-Security-Policy')!.value,
    ).toContain("'unsafe-eval'");
  });

  it('usa Report-Only quando pedido', () => {
    const headers = buildSecurityHeaders({ reportOnly: true });
    expect(headerValue(headers, 'Content-Security-Policy-Report-Only')).toBeTruthy();
    expect(headerValue(headers, 'Content-Security-Policy')).toBeUndefined();
  });
});
