const { body, validationResult } = require('express-validator');

class Validator {
  validate() {
    return (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }
      next();
    };
  }

  registerRules() {
    return [
      body('full_name')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 255 })
        .withMessage('Full name must be between 2 and 255 characters'),
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
      body('phone_number')
        .trim()
        .custom((value) => {
          const cleaned = value.replace(/[\s-]/g, '');
          // Pakistani mobile: 03XX-XXXXXXX (11 digits) or +923XX-XXXXXXX (13 digits)
          const pakistaniMobileRegex = /^(\+92[0-9]{10}|0[0-9]{10})$/;
          if (!pakistaniMobileRegex.test(cleaned)) {
            throw new Error('Please provide a valid Pakistani phone number (e.g., 03XXXXXXXXX or +923XXXXXXXXX)');
          }
          return true;
        }),
      body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain uppercase, lowercase, and number'),
      body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
      body('role')
        .isIn(['vehicle_owner', 'buyer', 'workshop', 'admin'])
        .withMessage('Invalid role specified'),
      body('termsAccepted')
        .custom(value => {
          return value === true || value === 'true' || value === '1';
        })
        .withMessage('You must accept the terms and conditions'),
      body('business_name')
        .if(body('role').equals('workshop'))
        .notEmpty()
        .withMessage('Business name is required for workshop accounts')
        .isLength({ max: 255 })
        .withMessage('Business name too long'),
      body('business_registration_number')
        .if(body('role').equals('workshop'))
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Registration number too long'),
      body('workshop_ntn')
        .if(body('role').equals('workshop'))
        .notEmpty()
        .withMessage('Workshop National Tax Number (NTN) is required')
        .matches(/^\d{7}-\d{1}$/)
        .withMessage('NTN must be in format: 1234567-8 (7 digits, hyphen, 1 digit)'),
      body('workshop_address')
        .if(body('role').equals('workshop'))
        .notEmpty()
        .withMessage('Workshop address is required')
        .isLength({ max: 500 })
        .withMessage('Address is too long'),
      body('workshop_city')
        .if(body('role').equals('workshop'))
        .notEmpty()
        .withMessage('Workshop city is required')
        .isLength({ max: 100 })
        .withMessage('City name too long'),
      body('workshop_country')
        .if(body('role').equals('workshop'))
        .notEmpty()
        .withMessage('Workshop country is required')
        .isLength({ max: 100 })
        .withMessage('Country name too long'),
      body('workshop_latitude')
        .if(body('role').equals('workshop'))
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Invalid workshop latitude'),
      body('workshop_longitude')
        .if(body('role').equals('workshop'))
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Invalid workshop longitude'),
      body('services')
        .if(body('role').equals('workshop'))
        .optional()
        .custom((value) => {
          if (value == null || value === '') return true;
          try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (!Array.isArray(parsed)) throw new Error('Services must be an array');
            for (const it of parsed) {
              if (!it || typeof it !== 'object') throw new Error('Invalid service item');
              const sid = parseInt(it.service_id, 10);
              if (!Number.isFinite(sid) || sid < 1) throw new Error('Invalid service_id');
              if (it.price_min != null && it.price_min !== '' && (isNaN(parseFloat(it.price_min)) || parseFloat(it.price_min) < 0)) {
                throw new Error('Invalid price_min');
              }
              if (it.price_max != null && it.price_max !== '' && (isNaN(parseFloat(it.price_max)) || parseFloat(it.price_max) < 0)) {
                throw new Error('Invalid price_max');
              }
            }
            return true;
          } catch (e) {
            throw new Error('Invalid services payload');
          }
        }),
      body('address')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Address is too long'),
      body('city')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('City name too long'),
      body('country')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Country name too long'),
      body('cnic')
        .optional()
        .trim()
        .isLength({ max: 20 })
        .withMessage('CNIC is too long'),
      this.validate()
    ];
  }

  loginRules() {
    return [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
      body('password')
        .notEmpty()
        .withMessage('Password is required'),
      this.validate()
    ];
  }

  resendVerificationRules() {
    return [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
      this.validate()
    ];
  }

  profileUpdateRules() {
    return [
      body('full_name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 255 })
        .withMessage('Full name must be between 2 and 255 characters'),
      body('phone_number')
        .optional()
        .matches(/^(\+92|0)?[0-9]{10}$/)
        .withMessage('Please provide a valid Pakistani phone number'),
      body('city')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('City name too long'),
      body('province')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Province name too long'),
      body('postal_code')
        .optional()
        .trim()
        .isLength({ max: 20 })
        .withMessage('Postal code too long'),
      body('business_name')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Business name too long'),
      body('workshop_ntn')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('NTN too long'),
      body('workshop_city')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Workshop city too long'),
      body('workshop_country')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Workshop country too long'),
      body('workshop_address')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Workshop address too long'),
      this.validate()
    ];
  }

  workshopServicesAddRules() {
    return [
      body('services')
        .isArray({ min: 1 })
        .withMessage('Services must be a non-empty array'),
      body('services.*.service_id')
        .isInt({ min: 1 })
        .withMessage('service_id must be a valid integer'),
      body('services.*.price_min')
        .optional({ nullable: true })
        .isFloat({ min: 0 })
        .withMessage('price_min must be a non-negative number'),
      body('services.*.price_max')
        .optional({ nullable: true })
        .isFloat({ min: 0 })
        .withMessage('price_max must be a non-negative number'),
      body('services.*.is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be boolean'),
      this.validate()
    ];
  }

  workshopServicesUpdateRules() {
    return [
      body('price_min')
        .optional({ nullable: true })
        .isFloat({ min: 0 })
        .withMessage('price_min must be a non-negative number'),
      body('price_max')
        .optional({ nullable: true })
        .isFloat({ min: 0 })
        .withMessage('price_max must be a non-negative number'),
      body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be boolean'),
      this.validate()
    ];
  }

  vehicleRegistrationRules() {
    return [
      body('registration_number')
        .trim()
        .notEmpty()
        .withMessage('Registration number is required')
        .isLength({ max: 50 })
        .withMessage('Registration number too long'),
      body('make')
        .trim()
        .notEmpty()
        .withMessage('Vehicle make is required')
        .isLength({ max: 100 })
        .withMessage('Make name too long'),
      body('model')
        .trim()
        .notEmpty()
        .withMessage('Vehicle model is required')
        .isLength({ max: 100 })
        .withMessage('Model name too long'),
      body('chassis_number')
        .trim()
        .notEmpty()
        .withMessage('Chassis number is required')
        .matches(/^[A-HJ-NPR-Z0-9]{11,17}$/i)
        .withMessage('Chassis number must be 11-17 characters, alphanumeric, excluding I, O, Q'),
      body('engine_number')
        .trim()
        .notEmpty()
        .withMessage('Engine number is required')
        .isLength({ min: 1, max: 50 })
        .withMessage('Engine number must be between 1 and 50 characters'),
      body('variant')
        .trim()
        .notEmpty()
        .withMessage('Variant is required')
        .isLength({ max: 100 })
        .withMessage('Variant name too long'),
      body('model_year')
        .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
        .withMessage('Please provide a valid model year'),
      body('body_type')
        .trim()
        .notEmpty()
        .withMessage('Body type is required')
        .isLength({ max: 50 })
        .withMessage('Body type name too long'),
      body('fuel_type')
        .isIn(['petrol', 'diesel', 'cng', 'lpg', 'electric', 'hybrid'])
        .withMessage('Invalid fuel type'),
      body('transmission_type')
        .isIn(['manual', 'automatic'])
        .withMessage('Invalid transmission type'),
      body('assembly')
        .trim()
        .notEmpty()
        .withMessage('Assembly is required')
        .isLength({ max: 50 })
        .withMessage('Assembly name too long'),
      body('engine_capacity')
        .trim()
        .notEmpty()
        .withMessage('Engine capacity is required')
        .isLength({ max: 20 })
        .withMessage('Engine capacity format invalid'),
      body('mileage_km')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Mileage must be a positive number'),
      body('color')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Color name too long'),
      body('registered_city')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Registered city name too long'),
      body('purchase_date')
        .optional()
        .isISO8601()
        .withMessage('Purchase date must be a valid date')
        .custom(value => {
          if (value && new Date(value) > new Date()) {
            throw new Error('Purchase date cannot be in the future');
          }
          return true;
        }),
      this.validate()
    ];
  }

  vehicleTransferInitiateRules() {
    return [
      body('new_owner_identifier')
        .trim()
        .notEmpty()
        .withMessage('Please provide the new owner\'s email or user ID')
        .custom(value => {
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          const isNumericId = /^\d+$/.test(value);
          if (!isEmail && !isNumericId) {
            throw new Error('Identifier must be a valid email or numeric user ID');
          }
          return true;
        }),
      this.validate()
    ];
  }

  vehicleUpdateRules() {
    return [
      body('color')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Color name too long'),
      body('mileage')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Mileage must be a positive number'),
      this.validate()
    ];
  }

  partRules() {
    return [
      body('part_name')
        .trim()
        .notEmpty()
        .withMessage('Part name is required')
        .isLength({ min: 1, max: 255 })
        .withMessage('Part name must be between 1 and 255 characters'),
      body('category')
        .notEmpty()
        .withMessage('Category is required')
        .isIn(['parts', 'fluids', 'filters'])
        .withMessage('Category must be one of: parts, fluids, filters'),
      body('price')
        .notEmpty()
        .withMessage('Price is required')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
      body('quantity')
        .notEmpty()
        .withMessage('Quantity is required')
        .isInt({ min: 0 })
        .withMessage('Quantity must be a non-negative integer'),
      this.validate()
    ];
  }

  partUpdateRules() {
    return [
      body('part_name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Part name must be between 1 and 255 characters'),
      body('category')
        .optional()
        .isIn(['parts', 'fluids', 'filters'])
        .withMessage('Category must be one of: parts, fluids, filters'),
      body('price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
      body('quantity')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Quantity must be a non-negative integer'),
      this.validate()
    ];
  }

  auctionCreateRules() {
    return [
      body('vehicle_id')
        .notEmpty()
        .withMessage('Vehicle is required')
        .isInt({ min: 1 })
        .withMessage('Invalid vehicle'),
      body('description')
        .if((value, { req }) => req.body.status !== 'draft')
        .trim()
        .notEmpty()
        .withMessage('Description is required')
        .isLength({ max: 10000 })
        .withMessage('Description is too long'),
      body('reserve_price')
        .if((value, { req }) => req.body.status !== 'draft')
        .notEmpty()
        .withMessage('Reserve price is required')
        .isFloat({ min: 0.01 })
        .withMessage('Reserve price must be a positive number'),
      body('starting_bid')
        .if((value, { req }) => req.body.status !== 'draft')
        .notEmpty()
        .withMessage('Starting bid is required')
        .isFloat({ min: 0.01 })
        .withMessage('Starting bid must be a positive number')
        .custom((value, { req }) => {
          const reserve = parseFloat(req.body.reserve_price);
          if (!isNaN(reserve) && parseFloat(value) > reserve) {
            throw new Error('Starting bid cannot exceed reserve price');
          }
          return true;
        }),
      body('duration_days')
        .if((value, { req }) => req.body.status !== 'draft')
        .notEmpty()
        .withMessage('Duration is required')
        .custom((value) => {
          const n = parseInt(value, 10);
          if (![3, 5, 7, 10].includes(n)) {
            throw new Error('Duration must be 3, 5, 7, or 10 days');
          }
          return true;
        }),
      body('start_immediate')
        .optional()
        .custom((value) => {
          if (value !== undefined && value !== null && value !== '' && value !== true && value !== 'true' && value !== '1' && value !== false && value !== 'false' && value !== '0') {
            throw new Error('Invalid start_immediate value');
          }
          return true;
        }),
      body('start_at')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
      body('featured')
        .optional()
        .custom((value) => {
          if (value !== undefined && value !== null && value !== '' && value !== true && value !== 'true' && value !== '1' && value !== false && value !== 'false' && value !== '0') {
            throw new Error('Invalid featured value');
          }
          return true;
        }),
      body('terms_accepted')
        .if((value, { req }) => req.body.status !== 'draft')
        .custom((value) => {
          const accepted = value === true || value === 'true' || value === '1';
          if (!accepted) {
            throw new Error('You must accept the auction terms and conditions');
          }
          return true;
        }),
      body('status')
        .optional()
        .isIn(['draft', 'active', 'scheduled'])
        .withMessage('Invalid status'),
      body('odometer_km')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Odometer must be a non-negative number'),
      body('photo_urls')
        .optional()
        .isArray()
        .withMessage('photo_urls must be an array')
        .custom((urls, { req }) => {
          if (!Array.isArray(urls)) return true;
          const status = req.body.status;
          const n = urls.length;
          const maxPhotos = 10;
          const minPublishPhotos = 5;
          if (status === 'draft' && (n < 0 || n > maxPhotos)) {
            throw new Error(`Draft may have 0 to ${maxPhotos} photos`);
          }
          if (status !== 'draft' && (n < minPublishPhotos || n > maxPhotos)) {
            throw new Error(`Publishing requires ${minPublishPhotos} to ${maxPhotos} photos`);
          }
          for (const u of urls) {
            if (typeof u !== 'string' || !u.trim()) {
              throw new Error('Each photo URL must be a non-empty string');
            }
          }
          return true;
        }),
      this.validate()
    ];
  }

  bidPlaceRules() {
    return [
      body('amount')
        .notEmpty()
        .withMessage('Bid amount is required')
        .isFloat({ min: 0.01 })
        .withMessage('Bid amount must be a positive number'),
      this.validate()
    ];
  }

  ownerAppointmentCreateRules() {
    return [
      body('workshop_id')
        .isInt({ min: 1 })
        .withMessage('workshop_id must be a valid integer'),
      body('vehicle_id')
        .isInt({ min: 1 })
        .withMessage('vehicle_id must be a valid integer'),
      body('requested_service_ids')
        .optional({ nullable: true })
        .custom((value) => {
          if (value == null) return true;
          if (!Array.isArray(value)) {
            throw new Error('requested_service_ids must be an array');
          }
          const seen = new Set();
          for (const item of value) {
            const id = parseInt(item, 10);
            if (!Number.isFinite(id) || id < 1) {
              throw new Error('requested_service_ids must contain valid integers');
            }
            if (seen.has(id)) {
              throw new Error('requested_service_ids cannot contain duplicates');
            }
            seen.add(id);
          }
          return true;
        }),
      body('preferred_at')
        .optional({ nullable: true })
        .isISO8601()
        .withMessage('preferred_at must be a valid datetime'),
      body('notes')
        .optional({ nullable: true })
        .isString()
        .withMessage('notes must be a string')
        .isLength({ max: 2000 })
        .withMessage('notes is too long'),
      this.validate()
    ];
  }

  workshopAppointmentUpdateRules() {
    return [
      body('status')
        .isIn(['accepted', 'rejected'])
        .withMessage('status must be accepted or rejected'),
      body('scheduled_at')
        .optional({ nullable: true })
        .isISO8601()
        .withMessage('scheduled_at must be a valid datetime'),
      body('workshop_response_note')
        .optional({ nullable: true })
        .isString()
        .withMessage('workshop_response_note must be a string')
        .isLength({ max: 2000 })
        .withMessage('workshop_response_note is too long'),
      this.validate()
    ];
  }

  ownerReviewCreateRules() {
    return [
      body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('rating must be an integer between 1 and 5'),
      body('comment')
        .optional({ nullable: true })
        .isString()
        .withMessage('comment must be a string')
        .isLength({ max: 3000 })
        .withMessage('comment is too long'),
      this.validate()
    ];
  }
}

module.exports = new Validator();