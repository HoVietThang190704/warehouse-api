import { Test, TestingModule } from '@nestjs/testing';
import { CatalogServiceService } from './catalog-service.service';
import { PrismaService } from './prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('CatalogServiceService - Edit & Detail & Delete', () => {
  let service: CatalogServiceService;

  const mockPrisma = {
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
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogServiceService,
        { provide: PrismaService, useValue: mockPrisma },
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
