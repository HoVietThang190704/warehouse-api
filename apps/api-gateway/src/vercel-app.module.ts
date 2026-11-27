import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketTicketController } from './socket/socket-ticket.controller';
import { SocketTicketService } from './socket/socket-ticket.service';
import { IdentityServiceModule } from '../../identity-service/src/identity-service.module';
import { CatalogServiceModule } from '../../catalog-service/src/catalog-service.module';
import { InventoryServiceModule } from '../../inventory-service/src/inventory-service.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    IdentityServiceModule,
    CatalogServiceModule,
    InventoryServiceModule,
  ],
  controllers: [AppController, SocketTicketController],
  providers: [AppService, SocketTicketService],
})
export class VercelAppModule {}
