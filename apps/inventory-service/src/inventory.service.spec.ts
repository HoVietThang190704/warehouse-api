import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from './prisma.service';
import { InventoryEventEmitterService } from './events/inventory-event-emitter.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;
  let mockEventEmitter: { emitInventoryChanged: jest.Mock };

  const mockPrisma: any = {
    warehouse: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    stockBalance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    stockDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    stockDocumentItem: {
      create: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
  };

  beforeEach(async () => {
    mockEventEmitter = {
      emitInventoryChanged: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryEventEmitterService, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
    mockPrisma.product.findMany.mockResolvedValue([]);
  });

  describe('recordStockReceipt (Nhập kho)', () => {
    it('should increment stock balance and record stock movement', async () => {
      const warehouseId = 'warehouse-uuid-1';
      const productId = 'product-uuid-1';

      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        name: 'Pin sạc 20000mAh',
        minStock: new Decimal(5),
      });

      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        warehouseId,
        productId,
        quantity: new Decimal(10),
      });

      mockPrisma.stockBalance.upsert.mockResolvedValue({
        warehouseId,
        productId,
        quantity: new Decimal(20),
      });

      mockPrisma.stockDocument.create.mockResolvedValue({
        id: 'doc-uuid-1',
        code: 'PNK-TEST',
      });
      mockPrisma.stockDocumentItem.create.mockResolvedValue({
        id: 'doc-item-uuid-1',
      });
      mockPrisma.stockMovement.create.mockResolvedValue({
        id: 'movement-uuid-1',
      });

      const result = await service.recordStockReceipt({
        warehouseId,
        productId,
        quantity: 10,
        unitCost: 200000,
        note: 'Nhập thêm hàng',
      });

      expect(mockPrisma.stockBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            quantity: new Decimal(20),
          }),
        }),
      );
      expect(result).toHaveProperty('newBalance', 20);
    });
  });

  describe('recordStockIssue (Xuất kho - chặn xuất âm)', () => {
    it('should throw BadRequestException if requested quantity exceeds current stock', async () => {
      const warehouseId = 'warehouse-uuid-1';
      const productId = 'product-uuid-1';

      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        name: 'Cáp sạc Type-C',
        minStock: new Decimal(5),
      });

      // Tồn hiện tại chỉ có 4 cái
      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        warehouseId,
        productId,
        quantity: new Decimal(4),
      });

      // Yêu cầu xuất 10 cái -> Phải bị chặn!
      await expect(
        service.recordStockIssue({
          warehouseId,
          productId,
          quantity: 10,
          reason: 'Bán lẻ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should decrement stock balance when requested quantity is valid', async () => {
      const warehouseId = 'warehouse-uuid-1';
      const productId = 'product-uuid-1';

      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        name: 'Cáp sạc Type-C',
        minStock: new Decimal(5),
      });

      // Tồn hiện tại có 10 cái
      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        warehouseId,
        productId,
        quantity: new Decimal(10),
      });

      mockPrisma.stockBalance.upsert.mockResolvedValue({
        warehouseId,
        productId,
        quantity: new Decimal(7),
      });

      mockPrisma.stockDocument.create.mockResolvedValue({
        id: 'doc-uuid-2',
        code: 'PXK-TEST',
      });
      mockPrisma.stockDocumentItem.create.mockResolvedValue({
        id: 'doc-item-uuid-2',
      });
      mockPrisma.stockMovement.create.mockResolvedValue({
        id: 'movement-uuid-2',
      });

      // Xuất 3 cái -> Tồn còn 7
      const result = await service.recordStockIssue({
        warehouseId,
        productId,
        quantity: 3,
        reason: 'Xuất mẫu',
      });

      expect(mockPrisma.stockBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            quantity: new Decimal(7),
          }),
        }),
      );
      expect(result).toHaveProperty('newBalance', 7);
    });
  });

  describe('getStockBalances & Alerts', () => {
    it('should flag isLowStock when quantity is less than or equal to minStock', async () => {
      const warehouseId = 'warehouse-uuid-1';
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });

      mockPrisma.stockBalance.findMany.mockResolvedValue([
        {
          warehouseId,
          productId: 'p1',
          quantity: new Decimal(3),
          product: {
            id: 'p1',
            name: 'Mặt hàng sắp hết',
            sku: 'SKU-01',
            minStock: new Decimal(5),
          },
          warehouse: { id: warehouseId, name: 'Kho Tổng' },
        },
        {
          warehouseId,
          productId: 'p2',
          quantity: new Decimal(20),
          product: {
            id: 'p2',
            name: 'Mặt hàng đủ tồn',
            sku: 'SKU-02',
            minStock: new Decimal(5),
          },
          warehouse: { id: warehouseId, name: 'Kho Tổng' },
        },
      ]);

      const balances = await service.getStockBalances({ warehouseId });
      expect(balances[0].isLowStock).toBe(true);
      expect(balances[1].isLowStock).toBe(false);
    });

    it('includes active products without a stock balance as not yet received', async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 'warehouse-1' });
      mockPrisma.stockBalance.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'new-1',
          name: 'Hàng mới',
          sku: 'NEW-1',
          barcode: null,
          imageUrl: null,
          minStock: new Decimal(0),
          baseUnit: { name: 'Cái' },
          category: null,
          createdAt: new Date(),
        },
      ]);

      const balances = await service.getStockBalances({
        warehouseId: 'warehouse-1',
        lowStockOnly: true,
      });

      expect(balances).toEqual([
        expect.objectContaining({
          productId: 'new-1',
          quantity: 0,
          status: 'NOT_RECEIVED',
          isLowStock: true,
        }),
      ]);
    });

    it('only marks zero stock as out of stock when a balance exists', async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 'warehouse-1' });
      mockPrisma.stockBalance.findMany.mockResolvedValue([
        {
          id: 'balance-1',
          warehouseId: 'warehouse-1',
          productId: 'sold-1',
          quantity: new Decimal(0),
          averageUnitCost: new Decimal(0),
          product: {
            id: 'sold-1',
            name: 'Đã xuất hết',
            sku: 'SOLD-1',
            minStock: new Decimal(5),
            baseUnit: { name: 'Cái' },
          },
          warehouse: { name: 'Kho' },
        },
      ]);

      const balances = await service.getStockBalances({
        warehouseId: 'warehouse-1',
      });

      expect(balances[0]).toEqual(
        expect.objectContaining({ status: 'OUT_OF_STOCK', quantity: 0 }),
      );
    });
  });

  describe('getDocuments', () => {
    it('should return documents enriched with creatorName and posterName', async () => {
      const warehouseId = 'warehouse-uuid-1';
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });

      mockPrisma.stockDocument.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          code: 'PNK-001',
          warehouseId,
          type: 'PURCHASE_RECEIPT',
          status: 'POSTED',
          createdBy: 'user-1',
          postedBy: 'user-1',
          createdAt: new Date(),
          items: [
            {
              id: 'item-1',
              productId: 'prod-1',
              quantity: new Decimal(10),
              unitCost: new Decimal(1000),
              lineTotal: new Decimal(10000),
              product: {
                name: 'Sản phẩm 1',
                sku: 'SP01',
                baseUnit: { name: 'Cái' },
              },
            },
          ],
        },
        {
          id: 'doc-2',
          code: 'PXK-002',
          warehouseId,
          type: 'MANUAL_OUT',
          status: 'POSTED',
          createdBy: null,
          postedBy: null,
          createdAt: new Date(),
          items: [],
        },
      ]);

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      ]);

      const docs = await service.getDocuments(warehouseId);

      expect(docs[0].creatorName).toBe('Nguyễn Văn A');
      expect(docs[0].posterName).toBe('Nguyễn Văn A');
      expect(docs[1].creatorName).toBe('Không xác định');
      expect(docs[1].posterName).toBe('Không xác định');
    });
  });

  describe('getDashboardKpis with performer name', () => {
    it('should return recentMovements enriched with performerName', async () => {
      const warehouseId = 'warehouse-uuid-1';
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      mockPrisma.product.count.mockResolvedValue(10);
      mockPrisma.stockBalance.findMany.mockResolvedValue([]);
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        {
          id: 'mov-1',
          movementType: 'IN',
          quantityDelta: new Decimal(5),
          createdAt: new Date(),
          product: {
            name: 'Sản phẩm A',
            sku: 'SPA',
            baseUnit: { name: 'Hộp' },
          },
          stockDocumentItem: {
            stockDocument: {
              code: 'PNK-01',
              createdBy: 'user-1',
              postedBy: 'user-1',
            },
          },
        },
        {
          id: 'mov-2',
          movementType: 'OUT',
          quantityDelta: new Decimal(-2),
          createdAt: new Date(),
          product: {
            name: 'Sản phẩm B',
            sku: 'SPB',
            baseUnit: { name: 'Cái' },
          },
          stockDocumentItem: {
            stockDocument: {
              code: 'PXK-01',
              createdBy: null,
              postedBy: null,
            },
          },
        },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', fullName: 'Trần Thị B', email: 'b@example.com' },
      ]);

      const kpis = await service.getDashboardKpis(warehouseId);
      expect(kpis.recentMovements[0].performerName).toBe('Trần Thị B');
      expect(kpis.recentMovements[1].performerName).toBe('Không xác định');
    });
  });

  describe('getDashboardKpis alerts', () => {
    it('counts every new product and separates it from products issued down to zero', async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 'warehouse-1' });
      mockPrisma.product.count.mockResolvedValue(4);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'new-1',
          name: 'Hàng 1',
          sku: 'NEW-1',
          minStock: new Decimal(5),
          baseUnit: { name: 'Cái' },
        },
        {
          id: 'new-2',
          name: 'Hàng 2',
          sku: 'NEW-2',
          minStock: new Decimal(5),
          baseUnit: { name: 'Cái' },
        },
        {
          id: 'new-3',
          name: 'Hàng 3',
          sku: 'NEW-3',
          minStock: new Decimal(5),
          baseUnit: { name: 'Cái' },
        },
      ]);
      mockPrisma.stockBalance.findMany.mockResolvedValue([
        {
          id: 'balance-1',
          warehouseId: 'warehouse-1',
          productId: 'sold-1',
          quantity: new Decimal(0),
          averageUnitCost: new Decimal(0),
          product: {
            id: 'sold-1',
            name: 'Hàng 4',
            sku: 'SOLD-1',
            minStock: new Decimal(5),
          },
        },
      ]);
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);

      const kpis = await service.getDashboardKpis('warehouse-1');

      expect(kpis.lowStockCount).toBe(4);
      expect(kpis.outOfStockCount).toBe(1);
      expect(kpis.lowStockItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'new-1', status: 'NOT_RECEIVED' }),
          expect.objectContaining({ id: 'new-2', status: 'NOT_RECEIVED' }),
          expect.objectContaining({ id: 'new-3', status: 'NOT_RECEIVED' }),
          expect.objectContaining({ id: 'sold-1', status: 'OUT_OF_STOCK' }),
        ]),
      );
    });
  });
});
