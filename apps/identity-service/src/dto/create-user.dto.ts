import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password!: string;

  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  fullName!: string;

  @IsEnum(UserRole, { message: 'Vai trò người dùng không hợp lệ' })
  role!: UserRole;

  @IsOptional()
  @IsUUID('4', { message: 'Mã kho phải là định dạng UUID' })
  warehouseId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Mã chi nhánh phải là định dạng UUID' })
  branchId?: string;
}
