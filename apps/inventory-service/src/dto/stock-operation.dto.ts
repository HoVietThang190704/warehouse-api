import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StockReceiptDto {
  @IsOptional()
  @IsUUID('4', { message: 'Warehouse ID must be a valid UUID' })
  warehouseId?: string;

  @IsUUID('4', { message: 'Product ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Product ID is required' })
  productId!: string;

  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @IsPositive({ message: 'Quantity must be greater than zero' })
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsNumber({}, { message: 'Unit cost must be a valid number' })
  @Min(0, { message: 'Unit cost cannot be negative' })
  @Type(() => Number)
  unitCost?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class StockIssueDto {
  @IsOptional()
  @IsUUID('4', { message: 'Warehouse ID must be a valid UUID' })
  warehouseId?: string;

  @IsUUID('4', { message: 'Product ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Product ID is required' })
  productId!: string;

  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @IsPositive({ message: 'Quantity must be greater than zero' })
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class StockQueryDto {
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  lowStockOnly?: boolean | string;

  @IsOptional()
  @IsString()
  search?: string;
}
