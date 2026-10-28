import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @IsBoolean({ message: 'Trạng thái hoạt động phải là boolean' })
  isActive!: boolean;
}
