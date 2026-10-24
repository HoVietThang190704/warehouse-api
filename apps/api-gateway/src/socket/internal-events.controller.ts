import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryEventsGateway } from './inventory-events.gateway';

export interface InternalInventoryChangedDto {
  warehouseId: string;
  productId?: string;
  documentCode?: string;
  type: 'IN' | 'OUT';
  performerId?: string;
}

@Controller(['api/internal/events', 'internal/events'])
export class InternalEventsController {
  constructor(private readonly gateway: InventoryEventsGateway) {}

  @Post('inventory-changed')
  @HttpCode(HttpStatus.OK)
  onInventoryChanged(
    @Body() dto: InternalInventoryChangedDto,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    const expectedSecret =
      process.env.INTERNAL_SOCKET_SECRET ||
      'warehouse_socket_internal_secret_key_demo';

    if (!internalSecret || internalSecret !== expectedSecret) {
      throw new UnauthorizedException(
        'Không có quyền phát sự kiện nội bộ vào Gateway!',
      );
    }

    this.gateway.broadcastInventoryChanged({
      ...dto,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }
}
