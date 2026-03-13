const LOCAL_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
];

type RuntimeEnvironment = Record<string, string | undefined>;

function isPlaceholderSecret(value?: string) {
  const normalized = value?.trim().toLowerCase();

  return (
    !normalized ||
    normalized === 'change-me' ||
    normalized.startsWith('change-me-')
  );
}

export function parseFrontendOrigins(
  value?: string,
  nodeEnv = process.env.NODE_ENV ?? 'development',
) {
  const origins = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins?.length) {
    return Array.from(new Set(origins));
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'FRONTEND_URL deve ser configurada em producao para liberar o CORS apenas para origens conhecidas.',
    );
  }

  return LOCAL_FRONTEND_ORIGINS;
}

export function isSwaggerEnabled(
  nodeEnv = process.env.NODE_ENV ?? 'development',
  swaggerEnabled = process.env.SWAGGER_ENABLED,
) {
  if (swaggerEnabled !== undefined) {
    return swaggerEnabled === 'true';
  }

  return nodeEnv !== 'production';
}

export function assertProductionEnvironment(
  env: RuntimeEnvironment = process.env,
) {
  if ((env.NODE_ENV ?? 'development') !== 'production') {
    return;
  }

  const requiredValues = [
    ['FRONTEND_URL', env.FRONTEND_URL],
    ['DATABASE_URL', env.DATABASE_URL],
    ['REDIS_URL', env.REDIS_URL],
  ] as const;

  const missingKeys = requiredValues
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);

  if (missingKeys.length) {
    throw new Error(
      `Variaveis obrigatorias ausentes em producao: ${missingKeys.join(', ')}.`,
    );
  }

  if (isPlaceholderSecret(env.JWT_ACCESS_SECRET)) {
    throw new Error(
      'JWT_ACCESS_SECRET precisa ser definido com um valor seguro em producao.',
    );
  }

  if (isPlaceholderSecret(env.APP_ENCRYPTION_KEY)) {
    throw new Error(
      'APP_ENCRYPTION_KEY precisa ser definido com um valor seguro em producao.',
    );
  }
}
