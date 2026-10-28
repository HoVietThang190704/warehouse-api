import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from './prisma.service';
import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    warehouse: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    branch: {
      findMany: jest.Mock;
    };
    refreshToken: {
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      warehouse: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      branch: {
        findMany: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listUsers', () => {
    it('should return users with warehouse and branch info mapped', async () => {
      const mockUsers = [
        {
          id: 'u1',
          email: 'staff@test.com',
          fullName: 'Staff One',
          role: UserRole.WAREHOUSE_STAFF,
          branchId: 'b1',
          warehouseId: 'w1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const mockWarehouses = [
        { id: 'w1', name: 'Kho 1', code: 'KHO-01', branchId: 'b1' },
      ];
      const mockBranches = [{ id: 'b1', name: 'Chi nhánh 1', code: 'CN-01' }];

      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.warehouse.findMany.mockResolvedValue(mockWarehouses);
      prisma.branch.findMany.mockResolvedValue(mockBranches);

      const result = await service.listUsers();
      expect(result).toHaveLength(1);
      expect(result[0].warehouseName).toBe('Kho 1');
      expect(result[0].branchName).toBe('Chi nhánh 1');
    });
  });

  describe('createUser', () => {
    it('should throw ConflictException if email exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createUser({
          email: 'test@test.com',
          password: 'password123',
          fullName: 'Test User',
          role: UserRole.WAREHOUSE_STAFF,
          warehouseId: 'w1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if staff has no warehouseId', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createUser({
          email: 'staff@test.com',
          password: 'password123',
          fullName: 'Staff User',
          role: UserRole.WAREHOUSE_STAFF,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if warehouse does not exist or is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.createUser({
          email: 'staff@test.com',
          password: 'password123',
          fullName: 'Staff User',
          role: UserRole.WAREHOUSE_STAFF,
          warehouseId: 'w-invalid',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully create staff and set branchId matching warehouse', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'w1',
        branchId: 'b1',
        isActive: true,
      });
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'u-new',
          ...data,
          passwordHash: undefined,
        }),
      );

      const result = await service.createUser({
        email: 'staff@test.com',
        password: 'password123',
        fullName: 'Staff User',
        role: UserRole.WAREHOUSE_STAFF,
        warehouseId: 'w1',
      });

      expect(result.id).toBe('u-new');
      expect(result.branchId).toBe('b1');
      expect(result.role).toBe(UserRole.WAREHOUSE_STAFF);
    });
  });

  describe('updateUser', () => {
    it('should not allow changing role of any SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin1',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      });

      await expect(
        service.updateUser(
          'admin1',
          { role: UserRole.WAREHOUSE_MANAGER },
          'admin1',
        ),
      ).rejects.toThrow(BadRequestException);

      prisma.user.findUnique.mockResolvedValue({
        id: 'admin2',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      });

      await expect(
        service.updateUser(
          'admin2',
          { role: UserRole.WAREHOUSE_STAFF },
          'admin1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should revoke refresh tokens upon update', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'staff1',
        role: UserRole.WAREHOUSE_STAFF,
        warehouseId: 'w1',
        branchId: 'b1',
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({
        id: 'staff1',
        fullName: 'Staff New Name',
        role: UserRole.WAREHOUSE_STAFF,
        warehouseId: 'w1',
        branchId: 'b1',
        isActive: true,
      });

      await service.updateUser('staff1', { fullName: 'Staff New Name' });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'staff1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });
  });

  describe('updateStatus', () => {
    it('should not allow locking any SUPER_ADMIN account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin1',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      });

      // Tự khóa chính mình
      await expect(
        service.updateStatus('admin1', false, 'admin1'),
      ).rejects.toThrow(BadRequestException);

      // Khóa Super Admin khác
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin2',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      });

      await expect(
        service.updateStatus('admin2', false, 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should revoke all tokens when deactivating a user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'staff1',
        role: UserRole.WAREHOUSE_STAFF,
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({
        id: 'staff1',
        isActive: false,
      });

      await service.updateStatus('staff1', false, 'admin1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'staff1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });
  });

  describe('resetPassword', () => {
    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('non-existent', 'newPass123', 'admin1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to reset password of another SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin2',
        role: UserRole.SUPER_ADMIN,
        email: 'admin2@test.com',
      });

      await expect(
        service.resetPassword('admin2', 'newPass123', 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update password and revoke tokens for staff or self', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.WAREHOUSE_STAFF,
        email: 'staff@test.com',
      });
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      const res = await service.resetPassword('u1', 'newPass123', 'admin1');
      expect(res.success).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
