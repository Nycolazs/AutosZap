import {
  assertProductionEnvironment,
  isSwaggerEnabled,
  parseFrontendOrigins,
} from './runtime-config';

describe('runtime-config', () => {
  describe('parseFrontendOrigins', () => {
    it('returns configured origins without duplicates', () => {
      expect(
        parseFrontendOrigins(
          'https://app.autozap.com, https://app.autozap.com, https://ops.autozap.com ',
          'production',
        ),
      ).toEqual(['https://app.autozap.com', 'https://ops.autozap.com']);
    });

    it('falls back to local origins outside production', () => {
      expect(parseFrontendOrigins(undefined, 'development')).toContain(
        'http://localhost:3000',
      );
    });

    it('throws when frontend origins are missing in production', () => {
      expect(() => parseFrontendOrigins(undefined, 'production')).toThrow(
        /FRONTEND_URL/,
      );
    });
  });

  describe('isSwaggerEnabled', () => {
    it('disables swagger by default in production', () => {
      expect(isSwaggerEnabled('production', undefined)).toBe(false);
    });

    it('respects explicit overrides', () => {
      expect(isSwaggerEnabled('production', 'true')).toBe(true);
      expect(isSwaggerEnabled('development', 'false')).toBe(false);
    });
  });

  describe('assertProductionEnvironment', () => {
    it('accepts non-production environments', () => {
      expect(() =>
        assertProductionEnvironment({
          NODE_ENV: 'development',
        }),
      ).not.toThrow();
    });

    it('throws when a required environment variable is missing', () => {
      expect(() =>
        assertProductionEnvironment({
          NODE_ENV: 'production',
          CONTROL_PLANE_DATABASE_URL:
            'postgresql://postgres:postgres@db:5432/autoszap_control',
          DATABASE_URL: 'postgresql://postgres:postgres@db:5432/autoszap',
          REDIS_URL: 'redis://redis:6379',
          JWT_ACCESS_SECRET: 'super-secret',
          APP_ENCRYPTION_KEY: 'secure-key',
        }),
      ).toThrow(/FRONTEND_URL/);
    });

    it('throws when production secrets still use placeholders', () => {
      expect(() =>
        assertProductionEnvironment({
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://app.autozap.com',
          CONTROL_PLANE_DATABASE_URL:
            'postgresql://postgres:postgres@db:5432/autoszap_control',
          DATABASE_URL: 'postgresql://postgres:postgres@db:5432/autoszap',
          REDIS_URL: 'redis://redis:6379',
          JWT_ACCESS_SECRET: 'change-me-access-secret',
          APP_ENCRYPTION_KEY: 'secure-key',
        }),
      ).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('accepts a valid production configuration', () => {
      expect(() =>
        assertProductionEnvironment({
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://app.autozap.com',
          CONTROL_PLANE_DATABASE_URL:
            'postgresql://postgres:postgres@db:5432/autoszap_control',
          DATABASE_URL: 'postgresql://postgres:postgres@db:5432/autoszap',
          REDIS_URL: 'redis://redis:6379',
          JWT_ACCESS_SECRET: 'super-secret',
          APP_ENCRYPTION_KEY: 'secure-key',
        }),
      ).not.toThrow();
    });
  });
});
