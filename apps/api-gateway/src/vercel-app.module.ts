import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketModule } from './socket/socket.module';
import { IdentityServiceModule } from '../../identity-service/src/identity-service.module';
import { CatalogServiceModule } from '../../catalog-service/src/catalog-service.module';
import { InventoryServiceModule } from '../../inventory-service/src/inventory-service.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    SocketModule,
    IdentityServiceModule,
    CatalogServiceModule,
    InventoryServiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class VercelAppModule {}
