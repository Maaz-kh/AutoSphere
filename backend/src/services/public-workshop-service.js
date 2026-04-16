const PublicWorkshopRepository = require('../repositories/public-workshop-repository');

const CATEGORY_ENUM = new Set(['maintenance', 'repair', 'inspection', 'bodywork']);

class PublicWorkshopService {
  async search(params = {}) {
    const {
      q,
      city,
      country,
      category,
      service_id,
      verified,
      lat,
      lng,
      radius_km,
      page,
      limit
    } = params;

    const verifiedOnly = verified == null || verified === '' || verified === true || verified === 'true' || verified === '1';
    const safeCategory = category && CATEGORY_ENUM.has(category) ? category : null;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      PublicWorkshopRepository.search({
        q,
        city,
        country,
        verifiedOnly,
        category: safeCategory,
        service_id,
        lat,
        lng,
        radius_km,
        limit: limitNum,
        offset
      }),
      PublicWorkshopRepository.count({
        q,
        city,
        country,
        verifiedOnly,
        category: safeCategory,
        service_id,
        lat,
        lng,
        radius_km
      })
    ]);

    return {
      workshops: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 0
      }
    };
  }

  async getDetails(workshopId, { verified } = {}) {
    const verifiedOnly = verified == null || verified === '' || verified === true || verified === 'true' || verified === '1';
    const workshop = await PublicWorkshopRepository.findPublicById(workshopId, verifiedOnly);
    if (!workshop) return null;
    const services = await PublicWorkshopRepository.listPublicServicesByWorkshopId(workshop.id);
    return { ...workshop, services };
  }

  async getReviews(workshopId, params = {}) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) {
      throw new Error('Invalid workshop ID.');
    }
    const pageNum = Math.max(1, parseInt(params.page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      PublicWorkshopRepository.listPublicReviewsByWorkshopId(id, { limit: limitNum, offset }),
      PublicWorkshopRepository.countPublicReviewsByWorkshopId(id)
    ]);

    return {
      reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 0
      }
    };
  }
}

module.exports = new PublicWorkshopService();

