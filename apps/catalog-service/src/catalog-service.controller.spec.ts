import { Test, TestingModule } from '@nestjs/testing';
import { CatalogServiceController } from './catalog-service.controller';
import { CatalogServiceService } from './catalog-service.service';
import { CloudinaryService } from '@common';
import { Reflector } from '@nestjs/core';

describe('CatalogServiceController', () => {
  let controller: CatalogServiceController;
  let service: CatalogServiceService;

  const mockCatalogService = {
    getCategories: jest.fn().mockResolvedValue([]),
    getProducts: jest.fn().mockResolvedValue([]),
    getUnits: jest.fn().mockResolvedValue([]),
  };

  const mockCloudinaryService = {
    uploadImage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogServiceController],
      providers: [
        { provide: CatalogServiceService, useValue: mockCatalogService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
        Reflector,
      ],
    }).compile();

    controller = module.get<CatalogServiceController>(CatalogServiceController);
    service = module.get<CatalogServiceService>(CatalogServiceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return categories', async () => {
    const categories = await controller.getCategories();
    expect(categories).toEqual([]);
    expect(service.getCategories).toHaveBeenCalled();
  });

  it('should return products', async () => {
    const products = await controller.getProducts();
    expect(products).toEqual([]);
    expect(service.getProducts).toHaveBeenCalled();
  });
});
