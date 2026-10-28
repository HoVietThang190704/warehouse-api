jest.mock('./jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let service: {
    listUsers: jest.Mock;
    createUser: jest.Mock;
    updateUser: jest.Mock;
    updateStatus: jest.Mock;
    resetPassword: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listUsers: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      updateStatus: jest.fn(),
      resetPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call listUsers', async () => {
    service.listUsers.mockResolvedValue([]);
    const res = await controller.listUsers();
    expect(res).toEqual([]);
    expect(service.listUsers).toHaveBeenCalled();
  });

  it('should call createUser', async () => {
    const dto = {
      email: 'staff@test.com',
      password: 'password123',
      fullName: 'Staff',
      role: UserRole.WAREHOUSE_STAFF,
      warehouseId: 'w1',
    };
    service.createUser.mockResolvedValue({ id: 'u1', ...dto });
    const res = await controller.createUser(dto);
    expect(res.id).toBe('u1');
    expect(service.createUser).toHaveBeenCalledWith(dto);
  });

  it('should call updateUser', async () => {
    service.updateUser.mockResolvedValue({ id: 'u1', fullName: 'Updated' });
    const res = await controller.updateUser(
      'u1',
      { fullName: 'Updated' },
      'admin1',
    );
    expect(res.fullName).toBe('Updated');
    expect(service.updateUser).toHaveBeenCalledWith(
      'u1',
      { fullName: 'Updated' },
      'admin1',
    );
  });

  it('should call updateStatus', async () => {
    service.updateStatus.mockResolvedValue({ id: 'u1', isActive: false });
    const res = await controller.updateStatus(
      'u1',
      { isActive: false },
      'admin1',
    );
    expect(res.isActive).toBe(false);
    expect(service.updateStatus).toHaveBeenCalledWith('u1', false, 'admin1');
  });

  it('should call resetPassword', async () => {
    service.resetPassword.mockResolvedValue({ success: true });
    const res = await controller.resetPassword(
      'u1',
      { newPassword: 'newPassword123' },
      'admin1',
    );
    expect(res.success).toBe(true);
    expect(service.resetPassword).toHaveBeenCalledWith(
      'u1',
      'newPassword123',
      'admin1',
    );
  });
});
