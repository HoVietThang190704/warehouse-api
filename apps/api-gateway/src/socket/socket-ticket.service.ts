import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

export interface SocketUserPayload {
  userId: string;
  role?: string;
  branchId?: string | null;
  warehouseId?: string | null;
}

interface TicketRecord {
  payload: SocketUserPayload;
  expiresAt: number;
}

@Injectable()
export class SocketTicketService {
  // Lưu ticket ngắn hạn trong bộ nhớ (TTL: 90 giây)
  private readonly tickets = new Map<string, TicketRecord>();
  private readonly ttlMs = 90 * 1000;

  issueTicket(payload: SocketUserPayload): string {
    this.cleanExpired();
    const token = randomBytes(24).toString('hex');
    this.tickets.set(token, {
      payload,
      expiresAt: Date.now() + this.ttlMs,
    });
    return token;
  }

  consumeTicket(ticket: string): SocketUserPayload | null {
    this.cleanExpired();
    const record = this.tickets.get(ticket);
    if (!record) {
      return null;
    }
    if (Date.now() > record.expiresAt) {
      this.tickets.delete(ticket);
      return null;
    }
    this.tickets.delete(ticket);
    return record.payload;
  }

  private cleanExpired() {
    const now = Date.now();
    for (const [key, value] of this.tickets.entries()) {
      if (now > value.expiresAt) {
        this.tickets.delete(key);
      }
    }
  }
}
