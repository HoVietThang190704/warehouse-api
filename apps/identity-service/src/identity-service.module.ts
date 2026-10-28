import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    JwtModule.register({}),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    UsersService,
    PrismaService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, UsersService, PrismaService],
})
export class IdentityServiceModule {}
