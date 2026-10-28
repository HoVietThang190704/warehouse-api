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

    // Gia nhập room theo vai trò (để phân luồng nhận thông báo)
    if (user.role) {
      client.join(`role:${user.role}`);
    }

    // Nếu là nhân viên, tự động gia nhập room của kho được gán
    if (user.role === 'WAREHOUSE_STAFF' && user.warehouseId) {
      client.join(`warehouse:${user.warehouseId}`);
    }
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

    const user = client.data?.user as SocketUserPayload | undefined;
    // Chặn nhân viên theo dõi kho khác với kho được gán
    if (
      user?.role === 'WAREHOUSE_STAFF' &&
      user.warehouseId &&
      user.warehouseId !== data.warehouseId
    ) {
      return {
        success: false,
        message: 'Bạn không có quyền theo dõi dữ liệu kho này',
      };
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
    // Chỉ gửi đến client đang ở trong room của kho đó hoặc tài khoản quản lý / admin toàn hệ thống
    this.server
      .to(`warehouse:${payload.warehouseId}`)
      .to('role:SUPER_ADMIN')
      .to('role:WAREHOUSE_MANAGER')
      .emit('inventory:changed', payload);
  }
}
