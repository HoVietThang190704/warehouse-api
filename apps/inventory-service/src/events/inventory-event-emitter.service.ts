import { Injectable, Logger } from '@nestjs/common';

export interface EmitInventoryChangedParams {
  warehouseId: string;
  productId?: string;
  documentCode?: string;
  type: 'IN' | 'OUT';
  performerId?: string;
}

@Injectable()
export class InventoryEventEmitterService {
  private readonly logger = new Logger(InventoryEventEmitterService.name);

  async emitInventoryChanged(
    params: EmitInventoryChangedParams,
  ): Promise<void> {
    const gatewayUrl =
      process.env.API_GATEWAY_URL ||
      process.env.GATEWAY_URL ||
      'http://localhost:3000';
    const secret =
      process.env.INTERNAL_SOCKET_SECRET ||
      'warehouse_socket_internal_secret_key_demo';

    try {
      const response = await fetch(
        `${gatewayUrl}/api/internal/events/inventory-changed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret,
          },
          body: JSON.stringify(params),
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.logger.warn(
          `Failed to emit inventory-changed event to gateway. Status: ${response.status} - ${errorText}`,
        );
      }
    } catch (err) {
      // Đảm bảo không làm hỏng flow nghiệp vụ của transaction nếu Gateway tạm down
      this.logger.error(
        `Error calling gateway internal event: ${(err as Error).message}`,
      );
    }
  }
}
