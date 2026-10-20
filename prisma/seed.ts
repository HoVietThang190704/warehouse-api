import { PrismaClient, UserRole, StockDocumentType, DocumentStatus, MovementType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding warehouse data to Neon PostgreSQL...');

  // 1. Create Default Branch
  const branch = await prisma.branch.upsert({
    where: { code: 'CN-01' },
    update: {},
    create: {
      code: 'CN-01',
      name: 'Chi nhánh Trung Tâm',
      address: '123 Đại Lộ Logistics, TP. Hồ Chí Minh',
      phone: '0901234567',
      isActive: true,
    },
  });

  // 2. Create Default Warehouse
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'KHO-01' },
    update: {},
    create: {
      branchId: branch.id,
      code: 'KHO-01',
      name: 'Kho Tổng Logistics',
      isDefault: true,
      isActive: true,
    },
  });

  // 3. Create Admin User
  const passwordHash = await bcrypt.hash('Admin@123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@warehouse.local' },
    update: {
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    },
    create: {
      email: 'admin@warehouse.local',
      passwordHash,
      fullName: 'Quản trị viên Kho',
      role: UserRole.SUPER_ADMIN,
      branchId: branch.id,
      isActive: true,
    },
  });

  // 4. Create Units
  const unitsData = [
    { code: 'CAI', name: 'Cái', dimension: 'COUNT' },
    { code: 'HOP', name: 'Hộp', dimension: 'COUNT' },
    { code: 'THUNG', name: 'Thùng', dimension: 'COUNT' },
    { code: 'KG', name: 'Kg', dimension: 'MASS' },
    { code: 'CUON', name: 'Cuộn', dimension: 'COUNT' },
  ];

  const unitsMap = new Map<string, string>();
  for (const u of unitsData) {
    const record = await prisma.unit.upsert({
      where: { code: u.code },
      update: {},
      create: u,
    });
    unitsMap.set(u.code, record.id);
  }

  // 5. Create Product Categories
  const categoriesData = [
    'Thiết bị điện tử',
    'Linh kiện cơ khí',
    'Bao bì đóng gói',
    'Hàng tiêu dùng',
  ];

  const categoriesMap = new Map<string, string>();
  for (const catName of categoriesData) {
    const existing = await prisma.productCategory.findFirst({ where: { name: catName } });
    if (existing) {
      categoriesMap.set(catName, existing.id);
    } else {
      const created = await prisma.productCategory.create({ data: { name: catName } });
      categoriesMap.set(catName, created.id);
    }
  }

  // 6. Create Products with Initial Stock Balances
  const productsToSeed = [
    {
      sku: 'TB-PIN-20K',
      barcode: '8930001001',
      name: 'Pin sạc dự phòng 20000mAh',
      category: 'Thiết bị điện tử',
      unit: 'CAI',
      minStock: 5,
      costPrice: 250000,
      sellingPrice: 420000,
      initialQty: 25,
      imageUrl: 'https://images.unsplash.com/photo-1609592424109-dd9892f1b177?w=400&q=80',
    },
    {
      sku: 'TB-CAP-TC',
      barcode: '8930001002',
      name: 'Cáp sạc nhanh Type-C 65W',
      category: 'Thiết bị điện tử',
      unit: 'CAI',
      minStock: 5,
      costPrice: 40000,
      sellingPrice: 90000,
      initialQty: 4, // LOW STOCK (< 5)
      imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&q=80',
    },
    {
      sku: 'BB-KEODONG-5CM',
      barcode: '8930001003',
      name: 'Băng keo dán thùng 5cm (Cuộn)',
      category: 'Bao bì đóng gói',
      unit: 'CUON',
      minStock: 5,
      costPrice: 15000,
      sellingPrice: 28000,
      initialQty: 2, // LOW STOCK (< 5)
      imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&q=80',
    },
    {
      sku: 'BB-THUNG-3020',
      barcode: '8930001004',
      name: 'Thùng carton 3 lớp 30x20x10',
      category: 'Bao bì đóng gói',
      unit: 'CAI',
      minStock: 20,
      costPrice: 3500,
      sellingPrice: 7000,
      initialQty: 100, // HEALTHY
      imageUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=400&q=80',
    },
    {
      sku: 'TB-TAINGHE-TWS',
      barcode: '8930001005',
      name: 'Tai nghe Bluetooth không dây TWS',
      category: 'Thiết bị điện tử',
      unit: 'CAI',
      minStock: 5,
      costPrice: 180000,
      sellingPrice: 350000,
      initialQty: 0, // OUT OF STOCK
      imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&q=80',
    },
    {
      sku: 'TB-CUSAC-65W',
      barcode: '8930001006',
      name: 'Củ sạc GaN 65W 3 cổng',
      category: 'Thiết bị điện tử',
      unit: 'CAI',
      minStock: 5,
      costPrice: 220000,
      sellingPrice: 390000,
      initialQty: 15, // HEALTHY
      imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&q=80',
    },
    {
      sku: 'BB-XOPBONG-50',
      barcode: '8930001007',
      name: 'Màng xốp bóng khí 50cm (Cuộn)',
      category: 'Bao bì đóng gói',
      unit: 'CUON',
      minStock: 10,
      costPrice: 75000,
      sellingPrice: 130000,
      initialQty: 3, // LOW STOCK (< 10)
      imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&q=80',
    },
    {
      sku: 'TB-CHUOT-WL',
      barcode: '8930001008',
      name: 'Chuột không dây Silent Click',
      category: 'Thiết bị điện tử',
      unit: 'CAI',
      minStock: 5,
      costPrice: 85000,
      sellingPrice: 160000,
      initialQty: 18, // HEALTHY
      imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400&q=80',
    },
  ];

  // Create an Opening Balance Document
  const openingDoc = await prisma.stockDocument.upsert({
    where: { code: 'OPEN-20261020-001' },
    update: {},
    create: {
      code: 'OPEN-20261020-001',
      warehouseId: warehouse.id,
      type: StockDocumentType.OPENING_BALANCE,
      status: DocumentStatus.POSTED,
      note: 'Khởi tạo số dư tồn kho ban đầu',
      createdBy: adminUser.id,
      postedBy: adminUser.id,
      postedAt: new Date(),
    },
  });

  for (const item of productsToSeed) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        minStock: item.minStock,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        imageUrl: item.imageUrl,
      },
      create: {
        sku: item.sku,
        barcode: item.barcode,
        name: item.name,
        categoryId: categoriesMap.get(item.category),
        baseUnitId: unitsMap.get(item.unit)!,
        minStock: item.minStock,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        imageUrl: item.imageUrl,
        isActive: true,
      },
    });

    // Stock balance
    await prisma.stockBalance.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
      update: {
        quantity: item.initialQty,
        averageUnitCost: item.costPrice,
      },
      create: {
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: item.initialQty,
        averageUnitCost: item.costPrice,
      },
    });

    if (item.initialQty > 0) {
      // Create Document Item
      const existingDocItem = await prisma.stockDocumentItem.findFirst({
        where: {
          stockDocumentId: openingDoc.id,
          productId: product.id,
        },
      });

      if (!existingDocItem) {
        const docItem = await prisma.stockDocumentItem.create({
          data: {
            stockDocumentId: openingDoc.id,
            productId: product.id,
            quantity: item.initialQty,
            unitCost: item.costPrice,
            lineTotal: item.initialQty * item.costPrice,
          },
        });

        // Create Movement
        await prisma.stockMovement.create({
          data: {
            warehouseId: warehouse.id,
            productId: product.id,
            stockDocumentItemId: docItem.id,
            movementType: MovementType.IN,
            quantityDelta: item.initialQty,
            unitCost: item.costPrice,
          },
        });
      }
    }
  }

  console.log('Seed completed successfully!');
  console.log(`Admin account: admin@warehouse.local / Admin@123`);
  console.log(`Warehouse: ${warehouse.name} (${warehouse.code})`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
