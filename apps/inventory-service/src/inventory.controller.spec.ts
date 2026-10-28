import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ForbiddenException } from '@nestjs/common';

describe('InventoryController Permissions', () => {
  let controller: InventoryController;
  let service: {
    getWarehouses: jest.Mock;
    getWarehousesForStaff: jest.Mock;
    getStockBalances: jest.Mock;
    getDashboardKpis: jest.Mock;
    getDocuments: jest.Mock;
    recordStockReceipt: jest.Mock;
    recordStockIssue: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getWarehouses: jest.fn().mockResolvedValue([]),
      getWarehousesForStaff: jest.fn().mockResolvedValue([]),
      getStockBalances: jest.fn().mockResolvedValue([]),
      getDashboardKpis: jest.fn().mockResolvedValue({}),
      getDocuments: jest.fn().mockResolvedValue([]),
      recordStockReceipt: jest.fn().mockResolvedValue({ id: 'doc-in' }),
      recordStockIssue: jest.fn().mockResolvedValue({ id: 'doc-out' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  describe('getWarehouses', () => {
    it('should return all warehouses for admin', async () => {
      await controller.getWarehouses('SUPER_ADMIN');
      expect(service.getWarehouses).toHaveBeenCalled();
      expect(service.getWarehousesForStaff).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if staff has no assigned warehouse', () => {
      expect(() =>
        controller.getWarehouses('WAREHOUSE_STAFF', undefined),
      ).toThrow(ForbiddenException);
    });

    it('should return only assigned warehouse for staff', async () => {
      await controller.getWarehouses('WAREHOUSE_STAFF', 'w-staff-1');
      expect(service.getWarehousesForStaff).toHaveBeenCalledWith('w-staff-1');
      expect(service.getWarehouses).not.toHaveBeenCalled();
    });
  });

  describe('recordStockReceipt (Nhập kho)', () => {
    it('should forbid WAREHOUSE_STAFF from creating stock receipt', () => {
      expect(() =>
        controller.recordStockReceipt(
          { warehouseId: 'w1', items: [{ productId: 'p1', quantity: 5 }] },
          'user-1',
          'WAREHOUSE_STAFF',
        ),
      ).toThrow(ForbiddenException);
    });

    it('should allow SUPER_ADMIN to create stock receipt', async () => {
      const res = await controller.recordStockReceipt(
        { warehouseId: 'w1', items: [{ productId: 'p1', quantity: 5 }] },
        'admin-1',
        'SUPER_ADMIN',
      );
      expect(res).toEqual({ id: 'doc-in' });
      expect(service.recordStockReceipt).toHaveBeenCalled();
    });
  });

  describe('recordStockIssue (Xuất kho)', () => {
    it('should forbid WAREHOUSE_STAFF if no assigned warehouse', () => {
      expect(() =>
        controller.recordStockIssue(
          { warehouseId: 'w1', productId: 'p1', quantity: 1 },
          'user-1',
          'WAREHOUSE_STAFF',
          undefined,
        ),
      ).toThrow(ForbiddenException);
    });

    it('should forbid WAREHOUSE_STAFF if trying to issue from another warehouse', () => {
      expect(() =>
        controller.recordStockIssue(
          { warehouseId: 'w-other', productId: 'p1', quantity: 1 },
          'user-1',
          'WAREHOUSE_STAFF',
          'w-assigned',
        ),
      ).toThrow(ForbiddenException);
    });

    it('should allow WAREHOUSE_STAFF to issue from their assigned warehouse', async () => {
      const dto = { warehouseId: 'w-assigned', productId: 'p1', quantity: 2 };
      const res = await controller.recordStockIssue(
        dto,
        'user-1',
        'WAREHOUSE_STAFF',
        'w-assigned',
      );
      expect(res).toEqual({ id: 'doc-out' });
      expect(dto.warehouseId).toBe('w-assigned');
      expect(service.recordStockIssue).toHaveBeenCalled();
    });
  });

  describe('getStockBalances', () => {
    it('should throw ForbiddenException if staff attempts to query another warehouse', () => {
      expect(() =>
        controller.getStockBalances(
          { warehouseId: 'w-other' },
          'WAREHOUSE_STAFF',
          'w-assigned',
        ),
      ).toThrow(ForbiddenException);
    });

    it('should enforce assigned warehouse for staff if warehouseId not specified in query', async () => {
      const query = {};
      await controller.getStockBalances(query, 'WAREHOUSE_STAFF', 'w-assigned');
      expect(query).toEqual({ warehouseId: 'w-assigned' });
      expect(service.getStockBalances).toHaveBeenCalledWith({
        warehouseId: 'w-assigned',
      });
    });
  });
});
