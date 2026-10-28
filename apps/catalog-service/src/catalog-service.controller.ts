import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CatalogServiceService } from './catalog-service.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './guards/roles.decorator';
import { CloudinaryService } from '@common';

@Controller('catalog')
export class CatalogServiceController {
  constructor(
    private readonly catalogService: CatalogServiceService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ==========================================
  // Image Upload (Cloudinary)
  // ==========================================

  @Post('upload')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @UseGuards(RolesGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.cloudinaryService.uploadImage(file);
  }

  // ==========================================
  // Categories & Units
  // ==========================================

  @Post('categories')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @UseGuards(RolesGuard)
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Get('categories')
  async getCategories() {
    return this.catalogService.getCategories();
  }

  @Get('categories/:id')
  async getCategoryById(@Param('id') id: string) {
    return this.catalogService.getCategoryById(id);
  }

  @Put('categories/:id')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @UseGuards(RolesGuard)
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @UseGuards(RolesGuard)
  async deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
  }

  @Get('units')
  async getUnits() {
    return this.catalogService.getUnits();
  }

  // ==========================================
  // Products
  // ==========================================

  @Post('products')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @UseGuards(RolesGuard)
  async createProduct(
    @Body() dto: CreateProductDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.catalogService.createProduct(dto, userId);
  }

  @Get('products')
  async getProducts(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.catalogService.getProducts(categoryId, search);
  }

  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    return this.catalogService.getProductById(id);
  }

  @Put('products/:id')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @UseGuards(RolesGuard)
  async updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(id, dto);
  }
}
