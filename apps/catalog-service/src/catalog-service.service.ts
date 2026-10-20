import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CatalogServiceService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Quản lý Danh mục (Categories)
  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.productCategory.create({
      data: {
        name: dto.name,
      },
    });
  }

  async getCategories() {
    return this.prisma.productCategory.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getCategoryById(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: {
        products: {
          include: { baseUnit: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy nhóm hàng');
    }

    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy nhóm hàng');
    }

    return this.prisma.productCategory.update({
      where: { id },
      data: {
        name: dto.name,
      },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy nhóm hàng');
    }

    if (category._count && category._count.products > 0) {
      throw new BadRequestException(
        `Không thể xóa nhóm hàng vì đang có ${category._count.products} mặt hàng thuộc nhóm này`,
      );
    }

    return this.prisma.productCategory.delete({
      where: { id },
    });
  }

  // 2. Quản lý Đơn vị tính (Units)
  async getUnits() {
    return this.prisma.unit.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // 3. Quản lý Sản phẩm (Products)
  async createProduct(dto: CreateProductDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku: dto.sku.toUpperCase() },
    });

    if (existingProduct) {
      throw new ConflictException(
        `Product with SKU '${dto.sku}' already exists`,
      );
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Resolve or fallback baseUnitId
    let baseUnitId = dto.baseUnitId;
    if (!baseUnitId) {
      const firstUnit = await this.prisma.unit.findFirst({
        orderBy: { code: 'asc' },
      });
      if (!firstUnit) {
        const defaultUnit = await this.prisma.unit.create({
          data: { code: 'CAI', name: 'Cái', dimension: 'COUNT' },
        });
        baseUnitId = defaultUnit.id;
      } else {
        baseUnitId = firstUnit.id;
      }
    }

    return this.prisma.product.create({
      data: {
        sku: dto.sku.toUpperCase(),
        barcode: dto.barcode,
        name: dto.name,
        categoryId: dto.categoryId,
        baseUnitId,
        minStock: new Prisma.Decimal(dto.minStock ?? 5),
        costPrice: new Prisma.Decimal(dto.costPrice ?? 0),
        sellingPrice: new Prisma.Decimal(dto.sellingPrice ?? 0),
        imageUrl: dto.imageUrl,
      },
      include: {
        category: true,
        baseUnit: true,
      },
    });
  }

  async getProducts(categoryId?: string, search?: string) {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        baseUnit: true,
        stockBalances: {
          include: { warehouse: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        baseUnit: true,
        stockBalances: {
          include: { warehouse: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy hàng hóa');
    }

    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy hàng hóa');
    }

    // Kiểm tra số lần phát sinh giao dịch kho
    const movementsCount = await this.prisma.stockMovement.count({
      where: { productId: id },
    });

    const hasMovements = movementsCount > 0;

    // Nếu đã phát sinh giao dịch kho, không cho phép đổi SKU hoặc đơn vị tính cơ sở
    if (hasMovements) {
      if (dto.sku && dto.sku.toUpperCase() !== product.sku) {
        throw new BadRequestException(
          'Không thể đổi mã SKU vì hàng hóa này đã phát sinh giao dịch nhập/xuất kho',
        );
      }
      if (dto.baseUnitId && dto.baseUnitId !== product.baseUnitId) {
        throw new BadRequestException(
          'Không thể đổi đơn vị tính cơ sở vì hàng hóa này đã phát sinh giao dịch nhập/xuất kho',
        );
      }
    }

    // Nếu đổi SKU (khi chưa có giao dịch), kiểm tra SKU trùng
    if (dto.sku && dto.sku.toUpperCase() !== product.sku) {
      const duplicateSku = await this.prisma.product.findFirst({
        where: {
          sku: dto.sku.toUpperCase(),
          id: { not: id },
        },
      });
      if (duplicateSku) {
        throw new ConflictException(
          `Mã SKU '${dto.sku}' đã được sử dụng bởi mặt hàng khác`,
        );
      }
    }

    // Kiểm tra barcode trùng nếu đổi
    if (dto.barcode && dto.barcode !== product.barcode) {
      const duplicateBarcode = await this.prisma.product.findFirst({
        where: {
          barcode: dto.barcode,
          id: { not: id },
        },
      });
      if (duplicateBarcode) {
        throw new ConflictException(
          `Mã vạch '${dto.barcode}' đã được sử dụng bởi mặt hàng khác`,
        );
      }
    }

    // Kiểm tra nhóm hàng tồn tại nếu có cập nhật
    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Không tìm thấy nhóm hàng');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sku !== undefined && !hasMovements
          ? { sku: dto.sku.toUpperCase() }
          : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode || null } : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId || null }
          : {}),
        ...(dto.baseUnitId !== undefined && !hasMovements
          ? { baseUnitId: dto.baseUnitId }
          : {}),
        ...(dto.minStock !== undefined
          ? { minStock: new Prisma.Decimal(dto.minStock) }
          : {}),
        ...(dto.costPrice !== undefined
          ? { costPrice: new Prisma.Decimal(dto.costPrice) }
          : {}),
        ...(dto.sellingPrice !== undefined
          ? { sellingPrice: new Prisma.Decimal(dto.sellingPrice) }
          : {}),
        ...(dto.imageUrl !== undefined
          ? { imageUrl: dto.imageUrl || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        category: true,
        baseUnit: true,
        stockBalances: {
          include: { warehouse: true },
        },
      },
    });
  }
}
