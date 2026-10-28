import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Vai trò người dùng không hợp lệ' })
  role?: UserRole;

  @IsOptional()
  @IsUUID('4', { message: 'Mã kho phải là định dạng UUID' })
  warehouseId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Mã chi nhánh phải là định dạng UUID' })
  branchId?: string | null;
}
