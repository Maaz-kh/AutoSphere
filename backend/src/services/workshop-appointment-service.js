const WorkshopsRepository = require('../repositories/workshops-repository');
const ServicesRepository = require('../repositories/service-repository');
const VehicleRepository = require('../repositories/vehicle-repository');
const WorkshopAppointmentRepository = require('../repositories/workshop-appointment-repository');
const WorkshopReviewRepository = require('../repositories/workshop-review-repository');
const WorkshopServicesRepository = require('../repositories/workshop-services-repository');

class WorkshopAppointmentService {
  async createAppointment(ownerUserId, data = {}) {
    const workshopId = parseInt(data.workshop_id, 10);
    const vehicleId = parseInt(data.vehicle_id, 10);
    const requestedServiceIds = this.normalizeRequestedServiceIds(data.requested_service_ids);

    if (!Number.isFinite(workshopId) || workshopId < 1) throw new Error('Invalid workshop_id.');
    if (!Number.isFinite(vehicleId) || vehicleId < 1) throw new Error('Invalid vehicle_id.');

    const workshop = await WorkshopsRepository.findById(workshopId);
    if (!workshop) throw new Error('Workshop not found.');
    if (workshop.is_verified !== 'verified') throw new Error('Workshop is not verified yet.');

    const vehicle = await VehicleRepository.findById(vehicleId);
    if (!vehicle || Number(vehicle.owner_id) !== Number(ownerUserId)) {
      throw new Error('Vehicle not found or does not belong to you.');
    }

    if (requestedServiceIds.length > 0) {
      const [validServices, workshopServiceIds] = await Promise.all([
        ServicesRepository.findByIds(requestedServiceIds),
        WorkshopServicesRepository.listActiveServiceIdsByWorkshopId(workshop.id)
      ]);

      const activeCatalogIds = new Set(
        validServices
          .filter((service) => Boolean(service.is_active))
          .map((service) => Number(service.id))
      );
      const offeredIds = new Set(workshopServiceIds);
      const invalidIds = requestedServiceIds.filter(
        (serviceId) => !activeCatalogIds.has(serviceId) || !offeredIds.has(serviceId)
      );

      if (invalidIds.length > 0) {
        throw new Error('One or more requested services are invalid or not offered by this workshop.');
      }
    }

    const preferredAt = data.preferred_at ? new Date(data.preferred_at) : null;
    if (preferredAt && Number.isNaN(preferredAt.getTime())) {
      throw new Error('Invalid preferred_at datetime.');
    }

    const id = await WorkshopAppointmentRepository.create({
      workshop_id: workshopId,
      vehicle_owner_id: ownerUserId,
      vehicle_id: vehicleId,
      requested_service_ids: requestedServiceIds,
      preferred_at: preferredAt ? preferredAt : null,
      notes: data.notes ? String(data.notes).trim() : null
    });
    return await WorkshopAppointmentRepository.findById(id);
  }

  async listOwnerAppointments(ownerUserId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = query.status ? String(query.status) : null;
    const [items, total] = await Promise.all([
      WorkshopAppointmentRepository.listByOwnerUserId(ownerUserId, { status, limit, offset }),
      WorkshopAppointmentRepository.countByOwnerUserId(ownerUserId, { status })
    ]);
    return {
      appointments: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 }
    };
  }

  async cancelOwnerAppointment(ownerUserId, appointmentId) {
    const appointment = await WorkshopAppointmentRepository.findById(appointmentId);
    if (!appointment || Number(appointment.vehicle_owner_id) !== Number(ownerUserId)) {
      throw new Error('Appointment not found.');
    }
    if (!['pending', 'accepted'].includes(appointment.status)) {
      throw new Error('Only pending or accepted appointments can be cancelled.');
    }
    await WorkshopAppointmentRepository.updateById(appointment.id, { status: 'cancelled' });
    return await WorkshopAppointmentRepository.findById(appointment.id);
  }

  async listWorkshopAppointments(workshopUserId, query = {}) {
    const workshop = await WorkshopsRepository.findByUserId(workshopUserId);
    if (!workshop) throw new Error('Workshop not found.');

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = query.status ? String(query.status) : null;

    const [items, total] = await Promise.all([
      WorkshopAppointmentRepository.listByWorkshopId(workshop.id, { status, limit, offset }),
      WorkshopAppointmentRepository.countByWorkshopId(workshop.id, { status })
    ]);
    return {
      appointments: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 }
    };
  }

  async updateWorkshopAppointment(workshopUserId, appointmentId, data = {}) {
    const workshop = await WorkshopsRepository.findByUserId(workshopUserId);
    if (!workshop) throw new Error('Workshop not found.');

    const appointment = await WorkshopAppointmentRepository.findById(appointmentId);
    if (!appointment || Number(appointment.workshop_id) !== Number(workshop.id)) {
      throw new Error('Appointment not found.');
    }

    const nextStatus = data.status ? String(data.status) : null;
    const allowedStatuses = ['accepted', 'rejected', 'cancelled'];
    if (!nextStatus || !allowedStatuses.includes(nextStatus)) {
      throw new Error('Status must be accepted, rejected, or cancelled.');
    }
    
    // Allow status updates for pending and accepted appointments
    if (appointment.status === 'pending' && !['accepted', 'rejected', 'cancelled'].includes(nextStatus)) {
      throw new Error('Pending appointments can only be accepted, rejected, or cancelled.');
    }
    if (appointment.status === 'accepted' && nextStatus !== 'cancelled') {
      throw new Error('Accepted appointments can only be cancelled.');
    }
    if (!['pending', 'accepted'].includes(appointment.status)) {
      throw new Error('Only pending or accepted appointments can be updated.');
    }

    const patch = {
      status: nextStatus,
      workshop_response_note: data.workshop_response_note ? String(data.workshop_response_note).trim() : null
    };
    if (nextStatus === 'accepted') {
      if (data.scheduled_at) {
        const scheduledAt = new Date(data.scheduled_at);
        if (Number.isNaN(scheduledAt.getTime())) throw new Error('Invalid scheduled_at datetime.');
        patch.scheduled_at = scheduledAt;
      } else if (appointment.preferred_at) {
        const preferredAt = new Date(appointment.preferred_at);
        if (!Number.isNaN(preferredAt.getTime())) {
          patch.scheduled_at = preferredAt;
        }
      }
    }

    await WorkshopAppointmentRepository.updateById(appointment.id, patch);
    return await WorkshopAppointmentRepository.findById(appointment.id);
  }

  async completeWorkshopAppointment(workshopUserId, appointmentId) {
    const workshop = await WorkshopsRepository.findByUserId(workshopUserId);
    if (!workshop) throw new Error('Workshop not found.');
    const appointment = await WorkshopAppointmentRepository.findById(appointmentId);
    if (!appointment || Number(appointment.workshop_id) !== Number(workshop.id)) {
      throw new Error('Appointment not found.');
    }
    if (appointment.status !== 'accepted') {
      throw new Error('Only accepted appointments can be marked completed.');
    }
    
    // Add time validation - cannot complete before scheduled time
    const effectiveAt = appointment.scheduled_at || appointment.preferred_at;
    if (effectiveAt) {
      const scheduledTime = new Date(effectiveAt);
      const currentTime = new Date();
      if (currentTime < scheduledTime) {
        throw new Error('Cannot mark appointment as completed before scheduled time.');
      }
    }
    
    await WorkshopAppointmentRepository.updateById(appointment.id, { status: 'completed' });
    return await WorkshopAppointmentRepository.findById(appointment.id);
  }

  async cancelWorkshopAppointment(workshopUserId, appointmentId) {
    const workshop = await WorkshopsRepository.findByUserId(workshopUserId);
    if (!workshop) throw new Error('Workshop not found.');
    
    const appointment = await WorkshopAppointmentRepository.findById(appointmentId);
    if (!appointment || Number(appointment.workshop_id) !== Number(workshop.id)) {
      throw new Error('Appointment not found.');
    }
    
    if (!['pending', 'accepted'].includes(appointment.status)) {
      throw new Error('Only pending or accepted appointments can be cancelled.');
    }
    
    await WorkshopAppointmentRepository.updateById(appointment.id, { status: 'cancelled' });
    return await WorkshopAppointmentRepository.findById(appointment.id);
  }

  async createReview(ownerUserId, appointmentId, data = {}) {
    const appointment = await WorkshopAppointmentRepository.findById(appointmentId);
    if (!appointment || Number(appointment.vehicle_owner_id) !== Number(ownerUserId)) {
      throw new Error('Appointment not found.');
    }
    if (appointment.status !== 'completed') {
      throw new Error('Review is allowed only for completed appointments.');
    }

    const existing = await WorkshopReviewRepository.findByAppointmentId(appointment.id);
    if (existing) throw new Error('Review already submitted for this appointment.');

    const rating = parseInt(data.rating, 10);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5.');
    }

    const reviewId = await WorkshopReviewRepository.create({
      appointment_id: appointment.id,
      workshop_id: appointment.workshop_id,
      vehicle_owner_id: ownerUserId,
      rating,
      comment: data.comment ? String(data.comment).trim() : null
    });
    return {
      id: reviewId,
      appointment_id: appointment.id,
      workshop_id: appointment.workshop_id,
      vehicle_owner_id: ownerUserId,
      rating,
      comment: data.comment ? String(data.comment).trim() : null
    };
  }

  normalizeRequestedServiceIds(serviceIds) {
    if (serviceIds == null) {
      return [];
    }

    if (!Array.isArray(serviceIds)) {
      throw new Error('requested_service_ids must be an array.');
    }

    return [...new Set(
      serviceIds
        .map((item) => parseInt(item, 10))
        .filter((id) => Number.isFinite(id) && id > 0)
    )];
  }
}

module.exports = new WorkshopAppointmentService();

