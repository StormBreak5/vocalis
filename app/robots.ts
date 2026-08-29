import type { MetadataRoute } from 'next';
import { getMetadataBaseUrl } from '@/src/infrastructure/config/app-public-url.server';

export default function robots(): MetadataRoute.Robots {
  const base = getMetadataBaseUrl();
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/entrar'],
      disallow: ['/sala/', '/historico'],
    },
    sitemap: new URL('/sitemap.xml', base).toString(),
  };
}
