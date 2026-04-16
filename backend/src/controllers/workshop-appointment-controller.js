const WorkshopAppointmentService = require('../services/workshop-appointment-service');

class WorkshopAppointmentController {
  async createOwnerAppointment(req, res) {
    try {
      const data = await WorkshopAppointmentService.createAppointment(req.user.userId, req.body || {});
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async listOwnerAppointments(req, res) {
    try {
      const data = await WorkshopAppointmentService.listOwnerAppointments(req.user.userId, req.query || {});
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async cancelOwnerAppointment(req, res) {
    try {
      const data = await WorkshopAppointmentService.cancelOwnerAppointment(req.user.userId, req.params.id);
      return res.json({ success: true, message: 'Appointment cancelled.', data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  async createOwnerReview(req, res) {
    try {
      const data = await WorkshopAppointmentService.createReview(req.user.userId, req.params.id, req.body || {});
      return res.status(201).json({ success: true, message: 'Review submitted.', data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  async listWorkshopAppointments(req, res) {
    try {
      const data = await WorkshopAppointmentService.listWorkshopAppointments(req.user.userId, req.query || {});
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 500;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  async updateWorkshopAppointment(req, res) {
    try {
      const data = await WorkshopAppointmentService.updateWorkshopAppointment(req.user.userId, req.params.id, req.body || {});
      return res.json({ success: true, message: 'Appointment updated.', data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  async completeWorkshopAppointment(req, res) {
    try {
      const data = await WorkshopAppointmentService.completeWorkshopAppointment(req.user.userId, req.params.id);
      return res.json({ success: true, message: 'Appointment marked completed.', data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  async cancelWorkshopAppointment(req, res) {
    try {
      const data = await WorkshopAppointmentService.cancelWorkshopAppointment(req.user.userId, req.params.id);
      return res.json({ success: true, message: 'Appointment cancelled.', data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }
}

module.exports = new WorkshopAppointmentController();

