import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString({ message: 'SKU must be a string' })
  @IsNotEmpty({ message: 'SKU is required' })
  @MaxLength(60, { message: 'SKU cannot exceed 60 characters' })
  sku!: string;

  @IsString({ message: 'Product name must be a string' })
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(160, { message: 'Product name cannot exceed 160 characters' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Base Unit ID must be a valid UUID' })
  baseUnitId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Min stock must be a valid number' })
  @Min(0, { message: 'Min stock cannot be negative' })
  @Type(() => Number)
  minStock?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  @Type(() => Number)
  costPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Selling price must be a valid number' })
  @Min(0, { message: 'Selling price cannot be negative' })
  @Type(() => Number)
  sellingPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Initial quantity must be a valid number' })
  @Min(0, { message: 'Initial quantity cannot be negative' })
  @Type(() => Number)
  initialQuantity?: number;

  @IsOptional()
  @IsUUID('4', { message: 'Warehouse ID must be a valid UUID' })
  warehouseId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
