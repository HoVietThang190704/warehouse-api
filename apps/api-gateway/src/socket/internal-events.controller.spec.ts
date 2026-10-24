import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { InternalEventsController } from './internal-events.controller';
import { InventoryEventsGateway } from './inventory-events.gateway';

describe('InternalEventsController', () => {
  let controller: InternalEventsController;
  let gateway: jest.Mocked<InventoryEventsGateway>;

  beforeEach(async () => {
    gateway = {
      broadcastInventoryChanged: jest.fn(),
    } as unknown as jest.Mocked<InventoryEventsGateway>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalEventsController],
      providers: [
        {
          provide: InventoryEventsGateway,
          useValue: gateway,
        },
      ],
    }).compile();

    process.env.INTERNAL_SOCKET_SECRET = 'secret-test-key';
    controller = module.get<InternalEventsController>(InternalEventsController);
  });

  it('should reject when internal secret header is wrong', () => {
    expect(() =>
      controller.onInventoryChanged(
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          documentCode: 'PNK-001',
          type: 'IN',
        },
        'wrong-secret',
      ),
    ).toThrow(UnauthorizedException);
    expect(gateway.broadcastInventoryChanged).not.toHaveBeenCalled();
  });

  it('should broadcast inventory:changed when secret matches', () => {
    const payload = {
      warehouseId: 'wh-1',
      productId: 'prod-1',
      documentCode: 'PNK-001',
      type: 'IN' as const,
    };
    const res = controller.onInventoryChanged(payload, 'secret-test-key');

    expect(res).toEqual({ success: true });
    expect(gateway.broadcastInventoryChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 'wh-1',
        productId: 'prod-1',
        documentCode: 'PNK-001',
      }),
    );
  });
});
