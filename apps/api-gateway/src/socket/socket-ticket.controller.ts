import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { SocketTicketService } from './socket-ticket.service';

interface AuthenticatedRequest extends Request {
  cookies: Record<string, string>;
}

@Controller(['api/socket', 'socket'])
export class SocketTicketController {
  private readonly jwtService = new JwtService();

  constructor(private readonly ticketService: SocketTicketService) {}

  @Get('ticket')
  getTicket(@Req() req: AuthenticatedRequest) {
    let token = req.headers.authorization?.replace('Bearer ', '');
    if (!token && req.cookies) {
      token = req.cookies['access_token'];
    }

    if (!token) {
      throw new UnauthorizedException('Chưa đăng nhập để cấp vé Socket');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      const ticket = this.ticketService.issueTicket({
        userId: payload.sub,
        role: payload.role,
        branchId: payload.branchId,
      });

      return {
        ticket,
        expiresInSeconds: 90,
      };
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
  }
}
