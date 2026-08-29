import type { MetadataRoute } from 'next';
import { getMetadataBaseUrl } from '@/src/infrastructure/config/app-public-url.server';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getMetadataBaseUrl();
  const now = new Date();
  return [
    { url: new URL('/', base).toString(), lastModified: now, priority: 1 },
    { url: new URL('/entrar', base).toString(), lastModified: now, priority: 0.8 },
  ];
}
