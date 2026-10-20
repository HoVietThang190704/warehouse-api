import { Test, TestingModule } from '@nestjs/testing';
import { IdentityServiceController } from './identity-service.controller';
import { IdentityServiceService } from './identity-service.service';

describe('IdentityServiceController', () => {
  let controller: IdentityServiceController;

  const mockIdentityService = {
    getHello: jest.fn().mockReturnValue('Hello World!'),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [IdentityServiceController],
      providers: [
        { provide: IdentityServiceService, useValue: mockIdentityService },
      ],
    }).compile();

    controller = app.get<IdentityServiceController>(IdentityServiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
