import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  SocketTicketService,
  SocketUserPayload,
} from './socket-ticket.service';

export interface InventoryChangedEventPayload {
  warehouseId: string;
  productId?: string;
  documentCode?: string;
  type: 'IN' | 'OUT';
  performerId?: string;
  timestamp: string;
}

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Cho phép mọi origin được cấu hình hoặc localhost/LAN
      callback(null, true);
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class InventoryEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(private readonly ticketService: SocketTicketService) {}

  async handleConnection(client: Socket) {
    const ticket =
      (client.handshake.auth?.ticket as string) ||
      (client.handshake.query?.ticket as string);

    if (!ticket) {
      client.disconnect(true);
      return;
    }

    const user: SocketUserPayload | null =
      this.ticketService.consumeTicket(ticket);
    if (!user) {
      client.disconnect(true);
      return;
    }

    // Gắn thông tin định danh vào socket instance
    client.data.user = user;

    // Tự động gia nhập room cá nhân của user
    client.join(`user:${user.userId}`);
  }

  handleDisconnect(client: Socket) {
    // Socket.IO tự động rời các room khi disconnect
  }

  @SubscribeMessage('join:warehouse')
  handleJoinWarehouse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { warehouseId: string },
  ) {
    if (!data?.warehouseId) {
      return { success: false, message: 'warehouseId is required' };
    }
    client.join(`warehouse:${data.warehouseId}`);
    return { success: true, room: `warehouse:${data.warehouseId}` };
  }

  @SubscribeMessage('leave:warehouse')
  handleLeaveWarehouse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { warehouseId: string },
  ) {
    if (!data?.warehouseId) {
      return { success: false, message: 'warehouseId is required' };
    }
    client.leave(`warehouse:${data.warehouseId}`);
    return { success: true };
  }

  broadcastInventoryChanged(payload: InventoryChangedEventPayload) {
    if (!this.server) {
      return;
    }
    // Phát cho tất cả client đang theo dõi kho này và toàn bộ client đang mở ứng dụng
    this.server.emit('inventory:changed', payload);
  }
}
