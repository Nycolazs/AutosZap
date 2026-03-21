import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/api/', '/platform/'],
      },
    ],
    sitemap: 'https://autoszap.com/sitemap.xml',
  };
}
