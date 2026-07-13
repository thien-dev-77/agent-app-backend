import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get('stats')
  getStats() { return this.service.getStats(); }

  // Customers
  @Get('customers')
  findAllCustomers(@Query('status') status?: string) { return this.service.findAllCustomers(status); }

  @Get('customers/:id')
  findOneCustomer(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOneCustomer(id); }

  @Post('customers')
  createCustomer(@Body() dto: { name: string; phone?: string; email?: string; source?: string; note?: string; teeth_condition?: string }) { return this.service.createCustomer(dto); }

  @Put('customers/:id')
  updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) { return this.service.updateCustomer(id, dto); }

  @Delete('customers/:id')
  removeCustomer(@Param('id', ParseUUIDPipe) id: string) { return this.service.removeCustomer(id); }

  // Appointments
  @Get('appointments')
  findAllAppointments(@Query('customer_id') customerId?: string, @Query('status') status?: string) { return this.service.findAllAppointments({ customer_id: customerId, status }); }

  @Get('appointments/:id')
  findOneAppointment(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOneAppointment(id); }

  @Post('appointments')
  createAppointment(@Body() dto: { customer_id: string; appointment_date: string; service?: string; branch?: string; note?: string }) { return this.service.createAppointment(dto); }

  @Put('appointments/:id')
  updateAppointment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) { return this.service.updateAppointment(id, dto); }

  @Delete('appointments/:id')
  removeAppointment(@Param('id', ParseUUIDPipe) id: string) { return this.service.removeAppointment(id); }
}
