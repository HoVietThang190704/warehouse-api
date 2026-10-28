import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers() {
    return this.usersService.listUsers();
  }

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('sub') currentUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    return this.usersService.updateUser(id, dto, currentUserId || headerUserId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('sub') currentUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    return this.usersService.updateStatus(
      id,
      dto.isActive,
      currentUserId || headerUserId,
    );
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('sub') currentUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    return this.usersService.resetPassword(
      id,
      dto.newPassword,
      currentUserId || headerUserId,
    );
  }
}
