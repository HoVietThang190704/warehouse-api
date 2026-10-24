import { Module } from '@nestjs/common';
import { SocketTicketService } from './socket-ticket.service';
import { InventoryEventsGateway } from './inventory-events.gateway';
import { SocketTicketController } from './socket-ticket.controller';
import { InternalEventsController } from './internal-events.controller';

@Module({
  controllers: [SocketTicketController, InternalEventsController],
  providers: [SocketTicketService, InventoryEventsGateway],
  exports: [InventoryEventsGateway, SocketTicketService],
})
export class SocketModule {}
