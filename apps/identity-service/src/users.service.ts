import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    const [users, warehouses, branches] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          branchId: true,
          warehouseId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.warehouse.findMany({
        select: { id: true, name: true, code: true, branchId: true },
      }),
      this.prisma.branch.findMany({
        select: { id: true, name: true, code: true },
      }),
    ]);

    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return users.map((user) => {
      const warehouse = user.warehouseId
        ? warehouseMap.get(user.warehouseId)
        : undefined;
      const branch = user.branchId ? branchMap.get(user.branchId) : undefined;

      return {
        ...user,
        warehouseName: warehouse?.name || null,
        warehouseCode: warehouse?.code || null,
        branchName: branch?.name || null,
        branchCode: branch?.code || null,
      };
    });
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException('Email đã tồn tại trong hệ thống');
    }

    if (dto.role === UserRole.WAREHOUSE_STAFF && !dto.warehouseId) {
      throw new BadRequestException(
        'Nhân viên kho bắt buộc phải được gán một kho cụ thể',
      );
    }

    let branchId = dto.branchId || null;

    if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!wh || !wh.isActive) {
        throw new BadRequestException(
          'Kho được chọn không tồn tại hoặc đã ngừng hoạt động',
        );
      }
      branchId = wh.branchId;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        fullName: dto.fullName.trim(),
        role: dto.role,
        warehouseId: dto.warehouseId || null,
        branchId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        warehouseId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto, _currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản nhân viên');
    }

    // Kiểm tra an toàn: Tuyệt đối không cho phép thay đổi vai trò của tài khoản SUPER_ADMIN
    if (
      user.role === UserRole.SUPER_ADMIN &&
      dto.role &&
      dto.role !== UserRole.SUPER_ADMIN
    ) {
      throw new BadRequestException(
        'Không thể thay đổi vai trò của tài khoản Quản trị viên cấp cao',
      );
    }

    const effectiveRole = dto.role || user.role;
    const effectiveWarehouseId =
      dto.warehouseId !== undefined ? dto.warehouseId : user.warehouseId;

    if (effectiveRole === UserRole.WAREHOUSE_STAFF && !effectiveWarehouseId) {
      throw new BadRequestException(
        'Nhân viên kho bắt buộc phải được gán một kho cụ thể',
      );
    }

    let branchId = dto.branchId !== undefined ? dto.branchId : user.branchId;

    if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!wh || !wh.isActive) {
        throw new BadRequestException(
          'Kho được chọn không tồn tại hoặc đã ngừng hoạt động',
        );
      }
      branchId = wh.branchId;
    } else if (dto.warehouseId === null) {
      branchId = null;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined
          ? { fullName: dto.fullName.trim() }
          : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.warehouseId !== undefined
          ? { warehouseId: dto.warehouseId }
          : {}),
        branchId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        warehouseId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Thu hồi refresh token để phiên cũ phải cập nhật lại
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return updated;
  }

  async updateStatus(id: string, isActive: boolean, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản nhân viên');
    }

    if (!isActive) {
      if (id === currentUserId) {
        throw new BadRequestException(
          'Quản trị viên không thể tự khóa tài khoản của chính mình',
        );
      }
      if (user.role === UserRole.SUPER_ADMIN) {
        throw new BadRequestException(
          'Không thể khóa tài khoản Quản trị viên cấp cao',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        warehouseId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  }

  async resetPassword(id: string, newPassword: string, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản nhân viên');
    }

    if (
      user.role === UserRole.SUPER_ADMIN &&
      currentUserId &&
      id !== currentUserId
    ) {
      throw new BadRequestException(
        'Không thể đặt lại mật khẩu của Quản trị viên cấp cao khác',
      );
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Đăng xuất các phiên đang chạy của user sau khi admin đổi mật khẩu
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return {
      success: true,
      message: 'Đặt lại mật khẩu thành công',
    };
  }
}
