import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  assertProductionEnvironment,
  isSwaggerEnabled,
  parseFrontendOrigins,
} from './common/config/runtime-config';
import { ControlPlanePrismaService } from './common/prisma/control-plane-prisma.service';
import { PrismaService } from './common/prisma/prisma.service';

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

async function bootstrap() {
  assertProductionEnvironment();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const allowedOrigins = parseFrontendOrigins(
    configService.get<string>('FRONTEND_URL'),
    configService.get<string>('NODE_ENV') ?? 'development',
  );

  app.use(helmet());
  app.use(cookieParser());
  // Limit request body size to prevent payload-based DoS attacks
  app.use(
    json({
      limit: '2mb',
      verify: (req: { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.enableCors({
    origin: (origin: string | undefined, callback: CorsOriginCallback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  if (
    isSwaggerEnabled(
      configService.get<string>('NODE_ENV') ?? 'development',
      configService.get<string>('SWAGGER_ENABLED'),
    )
  ) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AutosZap API')
      .setDescription('API REST multi-tenant do AutosZap')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app);
  const controlPlanePrismaService = app.get(ControlPlanePrismaService);
  controlPlanePrismaService.enableShutdownHooks(app);

  await app.listen(configService.get<number>('PORT') ?? 4000);
}
void bootstrap();
