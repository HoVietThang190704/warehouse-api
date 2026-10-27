import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CatalogServiceController } from './catalog-service.controller';
import { CatalogServiceService } from './catalog-service.service';
import { PrismaService } from './prisma.service';
import { RolesGuard } from './guards/roles.guard';
import { CloudinaryService, InventoryEventEmitterService } from '@common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    JwtModule.register({}),
  ],
  controllers: [CatalogServiceController],
  providers: [
    CatalogServiceService,
    PrismaService,
    RolesGuard,
    CloudinaryService,
    InventoryEventEmitterService,
  ],
  exports: [
    CatalogServiceService,
    PrismaService,
    RolesGuard,
    CloudinaryService,
    InventoryEventEmitterService,
  ],
})
export class CatalogServiceModule {}
