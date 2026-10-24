import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryEventEmitterService } from './events/inventory-event-emitter.service';

@Module({
  imports: [],
  controllers: [InventoryController],
  providers: [PrismaService, InventoryService, InventoryEventEmitterService],
  exports: [PrismaService, InventoryService, InventoryEventEmitterService],
})
export class InventoryServiceModule {}
