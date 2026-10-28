import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  StockReceiptDto,
  StockIssueDto,
  StockQueryDto,
} from './dto/stock-operation.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('warehouses')
  getWarehouses(
    @Headers('x-user-role') role?: string,
    @Headers('x-user-warehouse-id') staffWarehouseId?: string,
  ) {
    if (role === 'WAREHOUSE_STAFF') {
      if (!staffWarehouseId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán kho làm việc!',
        );
      }
      return this.inventoryService.getWarehousesForStaff(staffWarehouseId);
    }
    return this.inventoryService.getWarehouses();
  }

  @Get('balances')
  getStockBalances(
    @Query() query: StockQueryDto,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-warehouse-id') staffWarehouseId?: string,
  ) {
    if (role === 'WAREHOUSE_STAFF') {
      if (!staffWarehouseId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán kho làm việc!',
        );
      }
      if (query.warehouseId && query.warehouseId !== staffWarehouseId) {
        throw new ForbiddenException(
          'Nhân viên không có quyền xem dữ liệu tồn kho của kho khác!',
        );
      }
      query.warehouseId = staffWarehouseId;
    }
    return this.inventoryService.getStockBalances(query);
  }

  @Get('kpis')
  getDashboardKpis(
    @Query('warehouseId') warehouseId?: string,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-warehouse-id') staffWarehouseId?: string,
  ) {
    let targetWarehouseId = warehouseId;
    if (role === 'WAREHOUSE_STAFF') {
      if (!staffWarehouseId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán kho làm việc!',
        );
      }
      if (warehouseId && warehouseId !== staffWarehouseId) {
        throw new ForbiddenException(
          'Nhân viên không có quyền xem chỉ số KPI của kho khác!',
        );
      }
      targetWarehouseId = staffWarehouseId;
    }
    return this.inventoryService.getDashboardKpis(targetWarehouseId);
  }

  @Get('documents')
  getDocuments(
    @Query('warehouseId') warehouseId?: string,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-warehouse-id') staffWarehouseId?: string,
  ) {
    let targetWarehouseId = warehouseId;
    if (role === 'WAREHOUSE_STAFF') {
      if (!staffWarehouseId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán kho làm việc!',
        );
      }
      if (warehouseId && warehouseId !== staffWarehouseId) {
        throw new ForbiddenException(
          'Nhân viên không có quyền xem chứng từ của kho khác!',
        );
      }
      targetWarehouseId = staffWarehouseId;
    }
    return this.inventoryService.getDocuments(targetWarehouseId);
  }

  @Post('receipts')
  recordStockReceipt(
    @Body() dto: StockReceiptDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-role') role?: string,
  ) {
    if (role === 'WAREHOUSE_STAFF') {
      throw new ForbiddenException(
        'Nhân viên cấp dưới không có quyền tạo phiếu nhập kho!',
      );
    }
    if (role && role !== 'SUPER_ADMIN' && role !== 'WAREHOUSE_MANAGER') {
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện thao tác nhập kho!',
      );
    }
    return this.inventoryService.recordStockReceipt(dto, userId);
  }

  @Post('issues')
  recordStockIssue(
    @Body() dto: StockIssueDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-warehouse-id') staffWarehouseId?: string,
  ) {
    if (role === 'WAREHOUSE_STAFF') {
      if (!staffWarehouseId) {
        throw new ForbiddenException(
          'Tài khoản nhân viên chưa được gán kho để thực hiện xuất hàng!',
        );
      }
      if (dto.warehouseId && dto.warehouseId !== staffWarehouseId) {
        throw new ForbiddenException(
          'Nhân viên chỉ được phép xuất hàng tại kho được gán!',
        );
      }
      dto.warehouseId = staffWarehouseId;
    }
    return this.inventoryService.recordStockIssue(dto, userId);
  }
}
