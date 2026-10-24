import { Controller, Get, Post, Body, Query, Headers } from '@nestjs/common';
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
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Get('balances')
  getStockBalances(@Query() query: StockQueryDto) {
    return this.inventoryService.getStockBalances(query);
  }

  @Get('kpis')
  getDashboardKpis(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.getDashboardKpis(warehouseId);
  }

  @Get('documents')
  getDocuments(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.getDocuments(warehouseId);
  }

  @Post('receipts')
  recordStockReceipt(
    @Body() dto: StockReceiptDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.inventoryService.recordStockReceipt(dto, userId);
  }

  @Post('issues')
  recordStockIssue(
    @Body() dto: StockIssueDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.inventoryService.recordStockIssue(dto, userId);
  }
}
