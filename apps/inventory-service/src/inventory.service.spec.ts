import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from './prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  const mockPrisma = {
    warehouse: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
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

      mockPrisma.stockDocument.create.mockResolvedValue({ id: 'doc-uuid-1', code: 'PNK-TEST' });
      mockPrisma.stockDocumentItem.create.mockResolvedValue({ id: 'doc-item-uuid-1' });
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'movement-uuid-1' });

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

      mockPrisma.stockDocument.create.mockResolvedValue({ id: 'doc-uuid-2', code: 'PXK-TEST' });
      mockPrisma.stockDocumentItem.create.mockResolvedValue({ id: 'doc-item-uuid-2' });
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'movement-uuid-2' });

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
          product: { id: 'p1', name: 'Mặt hàng sắp hết', sku: 'SKU-01', minStock: new Decimal(5) },
          warehouse: { id: warehouseId, name: 'Kho Tổng' },
        },
        {
          warehouseId,
          productId: 'p2',
          quantity: new Decimal(20),
          product: { id: 'p2', name: 'Mặt hàng đủ tồn', sku: 'SKU-02', minStock: new Decimal(5) },
          warehouse: { id: warehouseId, name: 'Kho Tổng' },
        },
      ]);

      const balances = await service.getStockBalances({ warehouseId });
      expect(balances[0].isLowStock).toBe(true);
      expect(balances[1].isLowStock).toBe(false);
    });
  });
});
