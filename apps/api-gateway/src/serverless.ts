import * as dotenv from 'dotenv';
dotenv.config({ path: ['.env', 'apps/api/.env'] });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';
import { VercelAppModule } from './vercel-app.module';
import { TransformResponseInterceptor, AllExceptionsFilter } from '@common';

interface AuthenticatedRequest extends Request {
  cookies: Record<string, string>;
}

let cachedHandler: ((req: Request, res: Response) => void) | null = null;

async function bootstrapServerless() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const app = await NestFactory.create(VercelAppModule);

  // 1. Cấu hình đọc Cookie
  app.use(cookieParser());

  // 2. Cấu hình CORS cho Vercel & Local
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
      if (
        !origin ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.vercel.app') ||
        (frontendUrl &&
          (origin === frontendUrl || origin.startsWith(frontendUrl))) ||
        (process.env.VERCEL_URL && origin.includes(process.env.VERCEL_URL)) ||
        /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        )
      ) {
        callback(null, true);
      } else {
        if (process.env.NODE_ENV === 'production' && frontendUrl) {
          callback(new Error('Blocked by CORS'));
        } else {
          callback(null, true);
        }
      }
    },
    credentials: true,
  });

  // 3. Middleware giải mã JWT và gắn x-user-* headers (tương đương attachAuthHeaders của API Gateway)
  const jwtService = new JwtService();
  app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    delete req.headers['x-user-id'];
    delete req.headers['x-user-role'];
    delete req.headers['x-user-branch-id'];
    delete req.headers['x-user-warehouse-id'];

    let token = req.headers.authorization?.replace('Bearer ', '');
    if (!token && req.cookies) {
      token = req.cookies['access_token'];
    }

    if (token) {
      if (!req.headers.authorization) {
        req.headers.authorization = `Bearer ${token}`;
      }
      try {
        const secret =
          process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
        const payload = jwtService.verify(token, { secret });
        if (payload?.sub) req.headers['x-user-id'] = String(payload.sub);
        if (payload?.role) req.headers['x-user-role'] = String(payload.role);
        if (payload?.branchId)
          req.headers['x-user-branch-id'] = String(payload.branchId);
        if (payload?.warehouseId)
          req.headers['x-user-warehouse-id'] = String(payload.warehouseId);
      } catch {
        // Bỏ qua nếu token hết hạn hoặc không hợp lệ, để Guard của từng route xử lý
      }
    }
    next();
  });

  // 4. Đặt prefix '/api' cho toàn bộ route (ngoại trừ '/' và '/health')
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });

  // 5. Global Pipes, Interceptors & Exception Filters đồng bộ với các microservices
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();
  cachedHandler = app.getHttpAdapter().getInstance();
  return cachedHandler!;
}

export default async function handler(req: Request, res: Response) {
  const server = await bootstrapServerless();
  return server(req, res);
}
