import { Test, TestingModule } from '@nestjs/testing';
import { CatalogServiceService } from './catalog-service.service';
import { PrismaService } from './prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { InventoryEventEmitterService } from '@common';

describe('CatalogServiceService - Edit & Detail & Delete', () => {
  let service: CatalogServiceService;

  const mockInventoryEventEmitter = {
    emitInventoryChanged: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrisma: any = {
    $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
    warehouse: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    stockBalance: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
    stockDocument: {
      create: jest.fn(),
    },
    stockDocumentItem: {
      create: jest.fn(),
    },
    productCategory: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unit: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    stockMovement: {
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogServiceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryEventEmitterService, useValue: mockInventoryEventEmitter },
      ],
    }).compile();

    service = module.get<CatalogServiceService>(CatalogServiceService);
    jest.clearAllMocks();
  });

  describe('Category Details, Update & Delete', () => {
    it('should get category by id with products and count', async () => {
      const cat = {
        id: 'cat-1',
        name: 'Đồ gia dụng',
        products: [{ id: 'prod-1', name: 'Nồi cơm' }],
        _count: { products: 1 },
      };
      mockPrisma.productCategory.findUnique.mockResolvedValue(cat);

      const result = await service.getCategoryById('cat-1');
      expect(result).toEqual(cat);
      expect(mockPrisma.productCategory.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: {
          products: {
            include: { baseUnit: true },
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { products: true } },
        },
      });
    });

    it('should update category name', async () => {
      mockPrisma.productCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Cũ' });
      mockPrisma.productCategory.update.mockResolvedValue({ id: 'cat-1', name: 'Mới' });

      const updated = await service.updateCategory('cat-1', { name: 'Mới' });
      expect(updated.name).toBe('Mới');
      expect(mockPrisma.productCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { name: 'Mới' },
      });
    });

    it('should prevent deleting category if it has products', async () => {
      mockPrisma.productCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Có hàng',
        _count: { products: 3 },
      });

      await expect(service.deleteCategory('cat-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.productCategory.delete).not.toHaveBeenCalled();
    });

    it('should delete empty category', async () => {
      mockPrisma.productCategory.findUnique.mockResolvedValue({
        id: 'cat-empty',
        name: 'Trống',
        _count: { products: 0 },
      });
      mockPrisma.productCategory.delete.mockResolvedValue({ id: 'cat-empty' });

      const res = await service.deleteCategory('cat-empty');
      expect(res).toEqual({ id: 'cat-empty' });
      expect(mockPrisma.productCategory.delete).toHaveBeenCalledWith({
        where: { id: 'cat-empty' },
      });
    });
  });

  describe('Product Creation with Initial Quantity', () => {
    it('should create product without opening balance when initialQuantity is 0 or undefined', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1', name: 'Cái' });
      mockPrisma.product.create.mockResolvedValue({
        id: 'prod-new-1',
        sku: 'SP-01',
        name: 'Sản phẩm mới',
        baseUnitId: 'u-1',
      });

      const result = await service.createProduct({
        sku: 'SP-01',
        name: 'Sản phẩm mới',
        initialQuantity: 0,
      });

      expect(result.id).toBe('prod-new-1');
      expect(mockPrisma.stockBalance.create).not.toHaveBeenCalled();
      expect(mockPrisma.stockDocument.create).not.toHaveBeenCalled();
      expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if initialQuantity is negative', async () => {
      await expect(
        service.createProduct({
          sku: 'SP-NEG',
          name: 'Hàng lỗi',
          initialQuantity: -5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create product and record opening balance in transaction when initialQuantity > 0', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1', name: 'Cái' });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-default', name: 'Kho Tổng', isDefault: true });

      const createdProduct = {
        id: 'prod-with-stock',
        sku: 'SP-STOCK',
        name: 'Sản phẩm có tồn',
        costPrice: new Decimal(20000),
        baseUnitId: 'u-1',
      };
      mockPrisma.product.create.mockResolvedValue(createdProduct);
      mockPrisma.stockBalance.create.mockResolvedValue({
        id: 'sb-1',
        warehouseId: 'wh-default',
        productId: 'prod-with-stock',
        quantity: new Decimal(50),
        averageUnitCost: new Decimal(20000),
      });
      mockPrisma.stockDocument.create.mockResolvedValue({
        id: 'doc-1',
        code: 'OPEN-20261027-1234',
        warehouseId: 'wh-default',
      });
      mockPrisma.stockDocumentItem.create.mockResolvedValue({
        id: 'item-1',
        stockDocumentId: 'doc-1',
        productId: 'prod-with-stock',
        quantity: new Decimal(50),
      });
      mockPrisma.stockMovement.create.mockResolvedValue({
        id: 'mov-1',
        movementType: 'IN',
        quantityDelta: new Decimal(50),
      });

      const result = await service.createProduct(
        {
          sku: 'SP-STOCK',
          name: 'Sản phẩm có tồn',
          costPrice: 20000,
          initialQuantity: 50,
        },
        'user-1',
      );

      expect(result.id).toBe('prod-with-stock');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.stockBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 'wh-default',
            productId: 'prod-with-stock',
            quantity: new Decimal(50),
            averageUnitCost: new Decimal(20000),
          }),
        }),
      );
      expect(mockPrisma.stockDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 'wh-default',
            type: 'OPENING_BALANCE',
            status: 'POSTED',
            createdBy: 'user-1',
          }),
        }),
      );
      expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 'wh-default',
            productId: 'prod-with-stock',
            movementType: 'IN',
            quantityDelta: new Decimal(50),
          }),
        }),
      );
    });

    it('should throw NotFoundException if no active warehouse found when initialQuantity > 0', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1', name: 'Cái' });
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(
        service.createProduct({
          sku: 'SP-NOWH',
          name: 'Không có kho',
          initialQuantity: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Product Update rules', () => {
    it('should throw BadRequestException if product has movements and user changes SKU', async () => {
      const existing = {
        id: 'p-1',
        sku: 'SKU-OLD',
        baseUnitId: 'u-1',
        name: 'Sản phẩm 1',
      };
      mockPrisma.product.findUnique.mockResolvedValue(existing);
      mockPrisma.stockMovement.count.mockResolvedValue(5); // đã có 5 giao dịch kho

      await expect(
        service.updateProduct('p-1', {
          sku: 'SKU-NEW',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if product has movements and user changes baseUnitId', async () => {
      const existing = {
        id: 'p-1',
        sku: 'SKU-OLD',
        baseUnitId: 'u-1',
        name: 'Sản phẩm 1',
      };
      mockPrisma.product.findUnique.mockResolvedValue(existing);
      mockPrisma.stockMovement.count.mockResolvedValue(2); // đã có giao dịch kho

      await expect(
        service.updateProduct('p-1', {
          baseUnitId: 'u-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow updating name, prices, minStock even if movements exist', async () => {
      const existing = {
        id: 'p-1',
        sku: 'SKU-OLD',
        baseUnitId: 'u-1',
        name: 'Tên Cũ',
      };
      mockPrisma.product.findUnique.mockResolvedValue(existing);
      mockPrisma.stockMovement.count.mockResolvedValue(2);
      mockPrisma.product.update.mockResolvedValue({
        ...existing,
        name: 'Tên Mới',
        sellingPrice: new Decimal(100000),
      });

      const updated = await service.updateProduct('p-1', {
        name: 'Tên Mới',
        sellingPrice: 100000,
      });

      expect(updated.name).toBe('Tên Mới');
      expect(mockPrisma.product.update).toHaveBeenCalled();
    });

    it('should allow updating SKU and baseUnitId if product has NO movements', async () => {
      const existing = {
        id: 'p-1',
        sku: 'SKU-OLD',
        baseUnitId: 'u-1',
        name: 'Tên',
      };
      mockPrisma.product.findUnique.mockResolvedValue(existing);
      mockPrisma.stockMovement.count.mockResolvedValue(0); // CHƯA CÓ GIAO DỊCH
      mockPrisma.product.findFirst.mockResolvedValue(null); // Không trùng SKU
      mockPrisma.product.update.mockResolvedValue({
        ...existing,
        sku: 'SKU-NEW',
        baseUnitId: 'u-2',
      });

      const updated = await service.updateProduct('p-1', {
        sku: 'SKU-NEW',
        baseUnitId: 'u-2',
      });

      expect(updated.sku).toBe('SKU-NEW');
      expect(mockPrisma.product.update).toHaveBeenCalled();
    });
  });
});
