import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  StockReceiptDto,
  StockIssueDto,
  StockQueryDto,
} from './dto/stock-operation.dto';
import {
  StockDocumentType,
  DocumentStatus,
  MovementType,
  Prisma,
} from '@prisma/client';
import { InventoryEventEmitterService } from './events/inventory-event-emitter.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter?: InventoryEventEmitterService,
  ) {}

  private generateCode(type: 'IN' | 'OUT'): string {
    const prefix = type === 'IN' ? 'PNK' : 'PXK';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${dateStr}-${rand}`;
  }

  private async resolveWarehouseId(providedId?: string): Promise<string> {
    if (providedId) {
      return providedId;
    }
    const defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (defaultWarehouse) {
      return defaultWarehouse.id;
    }
    const anyWarehouse = await this.prisma.warehouse.findFirst({
      where: { isActive: true },
    });
    if (!anyWarehouse) {
      throw new NotFoundException(
        'Không tìm thấy kho hàng hoạt động nào trong hệ thống!',
      );
    }
    return anyWarehouse.id;
  }

  // 1. Lấy danh sách kho hàng
  async getWarehouses() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: { branch: true },
      orderBy: { isDefault: 'desc' },
    });
  }

  // 2. Lấy sổ số dư tồn kho (Stock Balances)
  async getStockBalances(query: StockQueryDto) {
    const warehouseId = await this.resolveWarehouseId(query.warehouseId);

    const [balances, unreceivedProducts] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: {
          warehouseId,
          product: {
            isActive: true,
            ...(query.search
              ? {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { sku: { contains: query.search, mode: 'insensitive' } },
                    {
                      barcode: { contains: query.search, mode: 'insensitive' },
                    },
                  ],
                }
              : {}),
          },
        },
        include: {
          warehouse: true,
          product: {
            include: {
              category: true,
              baseUnit: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.product.findMany({
        where: {
          isActive: true,
          stockBalances: { none: { warehouseId } },
          ...(query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { sku: { contains: query.search, mode: 'insensitive' } },
                  { barcode: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { category: true, baseUnit: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const mapped = balances.map((b) => {
      const quantity = Number(b.quantity);
      const minStock = Number(b.product?.minStock ?? 5);
      const isLowStock = quantity <= minStock;
      const isOutOfStock = quantity <= 0;

      let status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HEALTHY' = 'HEALTHY';
      if (isOutOfStock) {
        status = 'OUT_OF_STOCK';
      } else if (isLowStock) {
        status = 'LOW_STOCK';
      }

      return {
        id: b.id,
        warehouseId: b.warehouseId,
        warehouseName: b.warehouse?.name,
        productId: b.productId,
        productName: b.product?.name,
        productSku: b.product?.sku,
        productBarcode: b.product?.barcode,
        productImage: b.product?.imageUrl,
        categoryName: b.product?.category?.name,
        unitName: b.product?.baseUnit?.name ?? 'Cái',
        quantity,
        averageUnitCost: Number(b.averageUnitCost),
        minStock,
        status,
        isLowStock,
        updatedAt: b.updatedAt,
      };
    });

    const allBalances = [
      ...mapped,
      ...unreceivedProducts.map((product) => ({
        id: product.id,
        warehouseId,
        warehouseName: undefined,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productBarcode: product.barcode,
        productImage: product.imageUrl,
        categoryName: product.category?.name,
        unitName: product.baseUnit?.name ?? 'Cái',
        quantity: 0,
        averageUnitCost: 0,
        minStock: Number(product.minStock ?? 5),
        status: 'NOT_RECEIVED' as const,
        isLowStock: true,
        updatedAt: product.createdAt,
      })),
    ];

    if (query.lowStockOnly === true || query.lowStockOnly === 'true') {
      return allBalances.filter((item) => item.isLowStock);
    }

    return allBalances;
  }

  // 3. Nhập kho (Stock Receipt)
  async recordStockReceipt(dto: StockReceiptDto, userId?: string) {
    const warehouseId = await this.resolveWarehouseId(dto.warehouseId);

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { baseUnit: true },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy hàng hóa với ID ${dto.productId}`,
      );
    }

    const qty = Number(dto.quantity);
    if (qty <= 0) {
      throw new BadRequestException('Số lượng nhập phải lớn hơn 0');
    }
    const unitCost = Number(dto.unitCost ?? product.costPrice ?? 0);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Find existing balance
      const existingBalance = await tx.stockBalance.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId: dto.productId,
          },
        },
      });

      const currentQty = existingBalance ? Number(existingBalance.quantity) : 0;
      const newQty = currentQty + qty;

      // 2. Upsert balance
      const updatedBalance = await tx.stockBalance.upsert({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId: dto.productId,
          },
        },
        update: {
          quantity: new Prisma.Decimal(newQty),
          averageUnitCost:
            unitCost > 0 ? new Prisma.Decimal(unitCost) : undefined,
        },
        create: {
          warehouseId,
          productId: dto.productId,
          quantity: new Prisma.Decimal(newQty),
          averageUnitCost: new Prisma.Decimal(unitCost),
        },
      });

      // 3. Create posted document
      const docCode = this.generateCode('IN');
      const validUserId = userId && userId.trim() ? userId.trim() : null;
      const doc = await tx.stockDocument.create({
        data: {
          code: docCode,
          warehouseId,
          type: StockDocumentType.PURCHASE_RECEIPT,
          status: DocumentStatus.POSTED,
          note: dto.note || 'Nhập hàng vào kho',
          createdBy: validUserId,
          postedBy: validUserId,
          postedAt: new Date(),
        },
      });

      // 4. Create document item
      const docItem = await tx.stockDocumentItem.create({
        data: {
          stockDocumentId: doc.id,
          productId: dto.productId,
          quantity: new Prisma.Decimal(qty),
          unitCost: new Prisma.Decimal(unitCost),
          lineTotal: new Prisma.Decimal(qty * unitCost),
        },
      });

      // 5. Create immutable movement
      await tx.stockMovement.create({
        data: {
          warehouseId,
          productId: dto.productId,
          stockDocumentItemId: docItem.id,
          movementType: MovementType.IN,
          quantityDelta: new Prisma.Decimal(qty),
          unitCost: new Prisma.Decimal(unitCost),
        },
      });

      return {
        success: true,
        warehouseId,
        documentCode: doc.code,
        productId: dto.productId,
        productName: product.name,
        quantityAdded: qty,
        newBalance: Number(updatedBalance.quantity),
      };
    });

    // Phát sự kiện realtime CHỈ SAU KHI Transaction đã commit thành công
    if (this.eventEmitter) {
      void this.eventEmitter.emitInventoryChanged({
        warehouseId: result.warehouseId,
        productId: result.productId,
        documentCode: result.documentCode,
        type: 'IN',
        performerId: userId,
      });
    }

    return result;
  }

  // 4. Xuất kho (Stock Issue - chặn xuất âm tuyệt đối)
  async recordStockIssue(dto: StockIssueDto, userId?: string) {
    const warehouseId = await this.resolveWarehouseId(dto.warehouseId);

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { baseUnit: true },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy hàng hóa với ID ${dto.productId}`,
      );
    }

    const qty = Number(dto.quantity);
    if (qty <= 0) {
      throw new BadRequestException('Số lượng xuất phải lớn hơn 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Kiểm tra tồn hiện có
      const existingBalance = await tx.stockBalance.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId: dto.productId,
          },
        },
      });

      const currentQty = existingBalance ? Number(existingBalance.quantity) : 0;

      // Chặn xuất âm tuyệt đối
      if (currentQty < qty) {
        throw new BadRequestException(
          `Số lượng tồn kho không đủ để xuất! Tồn khả dụng: ${currentQty} ${product.baseUnit?.name || 'đơn vị'}, yêu cầu xuất: ${qty}`,
        );
      }

      const newQty = currentQty - qty;
      const unitCost = Number(
        existingBalance?.averageUnitCost ?? product.costPrice ?? 0,
      );

      // 2. Cập nhật giảm số dư
      const updatedBalance = await tx.stockBalance.upsert({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId: dto.productId,
          },
        },
        update: {
          quantity: new Prisma.Decimal(newQty),
        },
        create: {
          warehouseId,
          productId: dto.productId,
          quantity: new Prisma.Decimal(0),
        },
      });

      // 3. Tạo chứng từ xuất kho đã duyệt
      const docCode = this.generateCode('OUT');
      const validUserId = userId && userId.trim() ? userId.trim() : null;
      const doc = await tx.stockDocument.create({
        data: {
          code: docCode,
          warehouseId,
          type: StockDocumentType.MANUAL_OUT,
          status: DocumentStatus.POSTED,
          note: dto.note || dto.reason || 'Xuất kho hàng hóa',
          createdBy: validUserId,
          postedBy: validUserId,
          postedAt: new Date(),
        },
      });

      // 4. Tạo chi tiết chứng từ
      const docItem = await tx.stockDocumentItem.create({
        data: {
          stockDocumentId: doc.id,
          productId: dto.productId,
          quantity: new Prisma.Decimal(qty),
          unitCost: new Prisma.Decimal(unitCost),
          lineTotal: new Prisma.Decimal(qty * unitCost),
        },
      });

      // 5. Ghi sổ cái biến động (Movement ledger: âm)
      await tx.stockMovement.create({
        data: {
          warehouseId,
          productId: dto.productId,
          stockDocumentItemId: docItem.id,
          movementType: MovementType.OUT,
          quantityDelta: new Prisma.Decimal(-qty),
          unitCost: new Prisma.Decimal(unitCost),
        },
      });

      const minStock = Number(product.minStock ?? 5);
      const isLowStock = newQty <= minStock;

      return {
        success: true,
        warehouseId,
        documentCode: doc.code,
        productId: dto.productId,
        productName: product.name,
        quantityIssued: qty,
        newBalance: Number(updatedBalance.quantity),
        isLowStock,
        warning: isLowStock
          ? `CẢNH BÁO: Mặt hàng "${product.name}" hiện chỉ còn ${newQty} (dưới ngưỡng tối thiểu ${minStock})!`
          : null,
      };
    });

    // Phát sự kiện realtime CHỈ SAU KHI Transaction đã commit thành công
    if (this.eventEmitter) {
      void this.eventEmitter.emitInventoryChanged({
        warehouseId: result.warehouseId,
        productId: result.productId,
        documentCode: result.documentCode,
        type: 'OUT',
        performerId: userId,
      });
    }

    return result;
  }

  // 5. KPIs Dashboard
  async getDashboardKpis(warehouseId?: string) {
    const resolvedWarehouseId = await this.resolveWarehouseId(warehouseId);

    const [totalProducts, balances, recentMovements] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.getStockBalances({ warehouseId: resolvedWarehouseId }),
      this.prisma.stockMovement.findMany({
        where: { warehouseId: resolvedWarehouseId },
        include: {
          product: { include: { baseUnit: true } },
          stockDocumentItem: { include: { stockDocument: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    let totalStockUnits = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const outOfStockItems: Array<{
      id: string;
      name: string;
      sku: string;
      quantity: number;
      minStock: number;
      status: 'NOT_RECEIVED' | 'OUT_OF_STOCK' | 'LOW_STOCK';
    }> = [];
    const lowStockOnlyItems: Array<{
      id: string;
      name: string;
      sku: string;
      quantity: number;
      minStock: number;
      status: 'NOT_RECEIVED' | 'OUT_OF_STOCK' | 'LOW_STOCK';
    }> = [];

    for (const b of balances) {
      const qty = b.quantity;
      const minStock = b.minStock;
      totalStockUnits += qty;

      if (b.status === 'NOT_RECEIVED') {
        lowStockCount++;
        outOfStockItems.push({
          id: b.productId,
          name: b.productName,
          sku: b.productSku,
          quantity: qty,
          minStock,
          status: 'NOT_RECEIVED',
        });
      } else if (qty <= 0) {
        outOfStockCount++;
        outOfStockItems.push({
          id: b.productId,
          name: b.productName,
          sku: b.productSku,
          quantity: qty,
          minStock,
          status: 'OUT_OF_STOCK',
        });
      } else if (qty <= minStock) {
        lowStockCount++;
        lowStockOnlyItems.push({
          id: b.productId,
          name: b.productName,
          sku: b.productSku,
          quantity: qty,
          minStock,
          status: 'LOW_STOCK',
        });
      }
    }

    // Ưu tiên hàng hết kho/chưa nhập (màu đỏ, quantity <= 0) lên trên, sau đó mới tới hàng sắp hết (màu vàng)
    const lowStockItems = [...outOfStockItems, ...lowStockOnlyItems];

    const movementUserIds = Array.from(
      new Set(
        recentMovements
          .map(
            (m) =>
              m.stockDocumentItem?.stockDocument?.postedBy ||
              m.stockDocumentItem?.stockDocument?.createdBy,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const movementUsers = movementUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: movementUserIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];

    const movementUserMap = new Map(
      movementUsers.map((u) => [u.id, u.fullName || u.email]),
    );

    return {
      totalProducts,
      totalStockUnits,
      lowStockCount: lowStockCount + outOfStockCount,
      outOfStockCount,
      lowStockItems,
      recentMovements: recentMovements.map((m) => {
        const userId =
          m.stockDocumentItem?.stockDocument?.postedBy ||
          m.stockDocumentItem?.stockDocument?.createdBy;
        const performerName = userId
          ? movementUserMap.get(userId) || `Người dùng #${userId.slice(0, 8)}`
          : 'Không xác định';

        return {
          id: m.id,
          code: m.stockDocumentItem?.stockDocument?.code,
          type: m.movementType,
          productName: m.product.name,
          productSku: m.product.sku,
          unit: m.product.baseUnit?.name ?? 'Cái',
          quantity: Math.abs(Number(m.quantityDelta)),
          performerName,
          createdAt: m.createdAt,
        };
      }),
    };
  }

  // 6. Lịch sử chứng từ (Documents)
  async getDocuments(warehouseId?: string) {
    const resolvedWarehouseId = await this.resolveWarehouseId(warehouseId);
    const documents = await this.prisma.stockDocument.findMany({
      where: { warehouseId: resolvedWarehouseId },
      include: {
        items: {
          include: {
            product: { include: { baseUnit: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const userIds = Array.from(
      new Set(
        documents
          .flatMap((doc) => [doc.createdBy, doc.postedBy])
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    return documents.map((doc) => {
      const creatorName = doc.createdBy
        ? userMap.get(doc.createdBy) ||
          `Người dùng #${doc.createdBy.slice(0, 8)}`
        : 'Không xác định';

      const posterName = doc.postedBy
        ? userMap.get(doc.postedBy) || `Người dùng #${doc.postedBy.slice(0, 8)}`
        : 'Không xác định';

      const totalQuantity = doc.items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );

      const totalAmount = doc.items.reduce(
        (sum, item) => sum + Number(item.lineTotal || 0),
        0,
      );

      return {
        ...doc,
        creatorName,
        posterName,
        totalQuantity,
        totalAmount,
      };
    });
  }
}
