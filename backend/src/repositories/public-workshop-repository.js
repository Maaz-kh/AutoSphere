const database = require('../config/database');

function buildWhereClauses({ q, city, country, verifiedOnly, category, serviceId }) {
  const where = [];
  const params = [];

  if (verifiedOnly) {
    where.push("w.is_verified = 'verified'");
  }

  if (city) {
    where.push('LOWER(w.city) = LOWER(?)');
    params.push(city);
  }

  if (country) {
    where.push('LOWER(w.country) = LOWER(?)');
    params.push(country);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    where.push('(w.name LIKE ? OR w.address LIKE ? OR w.city LIKE ? OR w.country LIKE ?)');
    params.push(term, term, term, term);
  }

  if (category) {
    where.push('s.category = ?');
    params.push(category);
  }

  if (serviceId) {
    where.push('s.id = ?');
    params.push(serviceId);
  }

  return { where, params };
}

class PublicWorkshopRepository {
  async search({ q, city, country, verifiedOnly = true, category = null, service_id = null, lat = null, lng = null, radius_km = null, limit = 20, offset = 0 }) {
    const serviceId = service_id != null ? parseInt(service_id, 10) : null;
    const hasServiceFilter = Boolean(category || serviceId);

    const { where, params } = buildWhereClauses({ q, city, country, verifiedOnly, category, serviceId });

    const latNum = lat != null && lat !== '' ? parseFloat(lat) : null;
    const lngNum = lng != null && lng !== '' ? parseFloat(lng) : null;
    const useDistance = Number.isFinite(latNum) && Number.isFinite(lngNum);

    const selectDistance = useDistance
      ? `, (
          6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(w.latitude)) * COS(RADIANS(w.longitude) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(w.latitude))
          )
        ) AS distance_km`
      : '';

    const distanceParams = useDistance ? [latNum, lngNum, latNum] : [];

    const baseJoin = hasServiceFilter
      ? `JOIN workshop_services ws ON ws.workshop_id = w.id AND ws.is_active = TRUE
         JOIN services s ON s.id = ws.service_id AND s.is_active = TRUE`
      : '';

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    let havingClause = '';
    const havingParams = [];
    if (useDistance && radius_km != null && radius_km !== '' && Number.isFinite(parseFloat(radius_km))) {
      havingClause = 'HAVING distance_km <= ?';
      havingParams.push(parseFloat(radius_km));
    }

    const orderBy = useDistance ? 'ORDER BY distance_km ASC, w.name ASC' : 'ORDER BY w.name ASC';
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const query = `
      SELECT DISTINCT
        w.id,
        w.name,
        w.contact_phone,
        w.address,
        w.city,
        w.country,
        w.latitude,
        w.longitude,
        w.is_verified,
        COALESCE(rv.rating_avg, 0) AS rating_avg,
        COALESCE(rv.rating_count, 0) AS rating_count
        ${selectDistance}
      FROM workshops w
      LEFT JOIN (
        SELECT workshop_id, AVG(rating) AS rating_avg, COUNT(*) AS rating_count
        FROM workshop_reviews
        GROUP BY workshop_id
      ) rv ON rv.workshop_id = w.id
      ${baseJoin}
      ${whereClause}
      ${havingClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const rows = await database.query(
      query,
      [...distanceParams, ...params, ...havingParams, limitNum, offsetNum]
    );
    return rows;
  }

  async count({ q, city, country, verifiedOnly = true, category = null, service_id = null, lat = null, lng = null, radius_km = null }) {
    const serviceId = service_id != null ? parseInt(service_id, 10) : null;
    const hasServiceFilter = Boolean(category || serviceId);
    const { where, params } = buildWhereClauses({ q, city, country, verifiedOnly, category, serviceId });
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const baseJoin = hasServiceFilter
      ? `JOIN workshop_services ws ON ws.workshop_id = w.id AND ws.is_active = TRUE
         JOIN services s ON s.id = ws.service_id AND s.is_active = TRUE`
      : '';

    const latNum = lat != null && lat !== '' ? parseFloat(lat) : null;
    const lngNum = lng != null && lng !== '' ? parseFloat(lng) : null;
    const useDistance = Number.isFinite(latNum) && Number.isFinite(lngNum);

    const selectDistance = useDistance
      ? `, (
          6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(w.latitude)) * COS(RADIANS(w.longitude) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(w.latitude))
          )
        ) AS distance_km`
      : '';

    const distanceParams = useDistance ? [latNum, lngNum, latNum] : [];

    let havingClause = '';
    const havingParams = [];
    if (useDistance && radius_km != null && radius_km !== '' && Number.isFinite(parseFloat(radius_km))) {
      havingClause = 'HAVING distance_km <= ?';
      havingParams.push(parseFloat(radius_km));
    }

    if (useDistance) {
      const inner = `
        SELECT DISTINCT w.id
        ${selectDistance}
        FROM workshops w
        LEFT JOIN (
          SELECT workshop_id, AVG(rating) AS rating_avg, COUNT(*) AS rating_count
          FROM workshop_reviews
          GROUP BY workshop_id
        ) rv ON rv.workshop_id = w.id
        ${baseJoin}
        ${whereClause}
        ${havingClause}
      `;
      const result = await database.query(
        `SELECT COUNT(*) AS count FROM (${inner}) AS counted`,
        [...distanceParams, ...params, ...havingParams]
      );
      return result?.[0]?.count ?? 0;
    }

    const result = await database.query(
      `SELECT COUNT(DISTINCT w.id) AS count
       FROM workshops w
       ${baseJoin}
       ${whereClause}`,
      params
    );
    return result?.[0]?.count ?? 0;
  }

  async findPublicById(workshopId, verifiedOnly = true) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return null;

    const where = ['w.id = ?'];
    const params = [id];
    if (verifiedOnly) {
      where.push("w.is_verified = 'verified'");
    }

    const rows = await database.query(
      `SELECT w.id, w.user_id, w.name, w.contact_phone, w.address, w.city, w.country, w.latitude, w.longitude, w.is_verified, w.created_at,
              COALESCE(rv.rating_avg, 0) AS rating_avg,
              COALESCE(rv.rating_count, 0) AS rating_count
       FROM workshops w
       LEFT JOIN (
         SELECT workshop_id, AVG(rating) AS rating_avg, COUNT(*) AS rating_count
         FROM workshop_reviews
         GROUP BY workshop_id
       ) rv ON rv.workshop_id = w.id
       WHERE ${where.join(' AND ')}
       LIMIT 1`,
      params
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async listPublicServicesByWorkshopId(workshopId) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return [];
    const rows = await database.query(
      `SELECT ws.id,
              ws.service_id,
              s.category,
              s.name,
              ws.price_min,
              ws.price_max
       FROM workshop_services ws
       JOIN services s ON s.id = ws.service_id
       WHERE ws.workshop_id = ?
         AND ws.is_active = TRUE
         AND s.is_active = TRUE
       ORDER BY s.category ASC, s.name ASC`,
      [id]
    );
    return rows;
  }

  async listPublicReviewsByWorkshopId(workshopId, { limit = 20, offset = 0 } = {}) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return [];
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    return await database.query(
      `SELECT r.id,
              r.appointment_id,
              r.vehicle_owner_id,
              r.rating,
              r.comment,
              r.created_at,
              up.full_name AS reviewer_name
       FROM workshop_reviews r
       LEFT JOIN user_profiles up ON up.user_id = r.vehicle_owner_id
       WHERE r.workshop_id = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [id, limitNum, offsetNum]
    );
  }

  async countPublicReviewsByWorkshopId(workshopId) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return 0;
    const rows = await database.query(
      `SELECT COUNT(*) AS count FROM workshop_reviews WHERE workshop_id = ?`,
      [id]
    );
    return rows?.[0]?.count ?? 0;
  }
}

module.exports = new PublicWorkshopRepository();

