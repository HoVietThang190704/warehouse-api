import { Test, TestingModule } from '@nestjs/testing';
import { InventoryEventEmitterService } from './inventory-event-emitter.service';

describe('InventoryEventEmitterService', () => {
  let service: InventoryEventEmitterService;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryEventEmitterService],
    }).compile();

    service = module.get<InventoryEventEmitterService>(
      InventoryEventEmitterService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should send inventory changed event with headers to gateway', async () => {
    await service.emitInventoryChanged({
      warehouseId: 'wh-01',
      productId: 'prod-01',
      documentCode: 'PNK-20261022-1234',
      type: 'IN',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/internal/events/inventory-changed');
    expect(options.method).toBe('POST');
    expect(options.headers['x-internal-secret']).toBeDefined();
    expect(JSON.parse(options.body)).toEqual({
      warehouseId: 'wh-01',
      productId: 'prod-01',
      documentCode: 'PNK-20261022-1234',
      type: 'IN',
    });
  });

  it('should not throw if gateway request fails', async () => {
    mockFetch.mockRejectedValue(new Error('Gateway down'));

    await expect(
      service.emitInventoryChanged({
        warehouseId: 'wh-01',
        type: 'OUT',
      }),
    ).resolves.not.toThrow();
  });
});
