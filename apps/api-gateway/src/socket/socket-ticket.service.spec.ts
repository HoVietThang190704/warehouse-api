import { Test, TestingModule } from '@nestjs/testing';
import { SocketTicketService } from './socket-ticket.service';

describe('SocketTicketService', () => {
  let service: SocketTicketService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocketTicketService],
    }).compile();

    service = module.get<SocketTicketService>(SocketTicketService);
  });

  it('should issue a ticket and consume it once', () => {
    const ticket = service.issueTicket({
      userId: 'user-123',
      role: 'WAREHOUSE_STAFF',
      branchId: 'branch-1',
    });

    expect(typeof ticket).toBe('string');
    expect(ticket.length).toBeGreaterThan(16);

    const consumed = service.consumeTicket(ticket);
    expect(consumed).toEqual({
      userId: 'user-123',
      role: 'WAREHOUSE_STAFF',
      branchId: 'branch-1',
    });

    // Vé dùng 1 lần (Single-use)
    const secondTry = service.consumeTicket(ticket);
    expect(secondTry).toBeNull();
  });

  it('should reject invalid or unknown ticket', () => {
    expect(service.consumeTicket('random-non-existent-ticket')).toBeNull();
  });
});
