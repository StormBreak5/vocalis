import { describe, expect, it } from 'vitest';
import {
  AppPublicUrlConfigurationError,
  resolveAppPublicUrl,
} from '@/src/infrastructure/config/app-public-url';

describe('resolveAppPublicUrl', () => {
  it.each([undefined, '', '   '])('distingue configuracao ausente (%s)', value => {
    expect(resolveAppPublicUrl(value)).toEqual({ status: 'missing' });
  });

  it.each([
    ['https://vocalis.example.test', 'https://vocalis.example.test'],
    ['https://vocalis.example.test/', 'https://vocalis.example.test'],
    ['https://vocalis.example.test/karaoke///', 'https://vocalis.example.test/karaoke'],
    ['http://vocalis.example.test/base', 'http://vocalis.example.test/base'],
  ])('normaliza uma origem absoluta segura: %s', (value, baseUrl) => {
    expect(resolveAppPublicUrl(value, { runtime: 'production' })).toEqual({
      status: 'configured',
      baseUrl,
    });
  });

  it.each([
    'vocalis.example.test',
    '/karaoke',
    'ftp://vocalis.example.test',
    'https://usuario:senha@vocalis.example.test',
    'https://vocalis.example.test?segredo=1',
    'https://vocalis.example.test/#fragmento',
  ])('rejeita configuracao insegura ou invalida sem reproduzir o valor: %s', value => {
    let thrown: unknown;
    try {
      resolveAppPublicUrl(value, { runtime: 'production' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppPublicUrlConfigurationError);
    expect((thrown as Error).message).not.toContain(value);
    expect((thrown as Error).message).not.toContain('senha');
  });

  it.each([
    'http://localhost:3000',
    'http://app.localhost:3000/base',
    'http://127.0.0.1:3000',
    'http://127.25.10.8:3000',
    'http://[::1]:3000',
  ])('rejeita loopback em producao: %s', value => {
    expect(() => resolveAppPublicUrl(value, { runtime: 'production' }))
      .toThrow(AppPublicUrlConfigurationError);
  });

  it.each(['development', 'test'] as const)('permite loopback em %s', runtime => {
    expect(resolveAppPublicUrl('http://localhost:3000/', { runtime })).toEqual({
      status: 'configured',
      baseUrl: 'http://localhost:3000',
    });
  });

  it('permite loopback no executor de teste controlado mesmo com build de producao', () => {
    expect(resolveAppPublicUrl('http://127.0.0.1:3100/', {
      runtime: 'production',
      controlledTestEnvironment: true,
    })).toEqual({
      status: 'configured',
      baseUrl: 'http://127.0.0.1:3100',
    });
  });
});
