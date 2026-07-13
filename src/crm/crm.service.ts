import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import { Appointment } from '../entities/appointment.entity';

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
  ) {}

  // ==================== CUSTOMERS ====================

  async findAllCustomers(status?: string): Promise<Customer[]> {
    const where = status ? { status } : {};
    return this.customerRepo.find({ where, order: { created_at: 'DESC' }, relations: ['appointments'] });
  }

  async findOneCustomer(id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id }, relations: ['appointments'] });
    if (!customer) throw new NotFoundException(`Customer "${id}" not found`);
    return customer;
  }

  async createCustomer(dto: { name: string; phone?: string; email?: string; source?: string; note?: string; teeth_condition?: string }): Promise<Customer> {
    return this.customerRepo.save(this.customerRepo.create(dto));
  }

  async updateCustomer(id: string, dto: Partial<Customer>): Promise<Customer> {
    const customer = await this.findOneCustomer(id);
    Object.assign(customer, dto);
    return this.customerRepo.save(customer);
  }

  async removeCustomer(id: string): Promise<void> {
    const customer = await this.findOneCustomer(id);
    await this.customerRepo.remove(customer);
  }

  // ==================== APPOINTMENTS ====================

  async findAllAppointments(params?: { customer_id?: string; status?: string }): Promise<Appointment[]> {
    const where: any = {};
    if (params?.customer_id) where.customer_id = params.customer_id;
    if (params?.status) where.status = params.status;
    return this.appointmentRepo.find({ where, order: { appointment_date: 'ASC' }, relations: ['customer'] });
  }

  async findOneAppointment(id: string): Promise<Appointment> {
    const apt = await this.appointmentRepo.findOne({ where: { id }, relations: ['customer'] });
    if (!apt) throw new NotFoundException(`Appointment "${id}" not found`);
    return apt;
  }

  async createAppointment(dto: { customer_id: string; appointment_date: string; service?: string; branch?: string; note?: string }): Promise<Appointment> {
    return this.appointmentRepo.save(this.appointmentRepo.create({ ...dto, appointment_date: new Date(dto.appointment_date) }));
  }

  async updateAppointment(id: string, dto: Partial<Appointment>): Promise<Appointment> {
    const apt = await this.findOneAppointment(id);
    if (dto.appointment_date) (dto as any).appointment_date = new Date(dto.appointment_date as any);
    Object.assign(apt, dto);
    return this.appointmentRepo.save(apt);
  }

  async removeAppointment(id: string): Promise<void> {
    const apt = await this.findOneAppointment(id);
    await this.appointmentRepo.remove(apt);
  }

  // ==================== STATS ====================

  async getStats() {
    const [customers, appointments, pending, confirmed] = await Promise.all([
      this.customerRepo.count(),
      this.appointmentRepo.count(),
      this.appointmentRepo.count({ where: { status: 'pending' } }),
      this.appointmentRepo.count({ where: { status: 'confirmed' } }),
    ]);
    return { customers, appointments, pending, confirmed };
  }
}
