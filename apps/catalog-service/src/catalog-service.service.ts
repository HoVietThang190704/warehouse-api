import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
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
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}
