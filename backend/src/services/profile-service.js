const database = require('../config/database');

// Profile Service Class
class ProfileService {
  constructor() {
    this.db = database;
  }

  // Get User Profile
  async getProfile(userId) {
    try {
      const results = await this.db.query(
        `SELECT p.*,
                u.email,
                u.role,
                u.is_verified,
                u.created_at,
                w.name AS business_name,
                w.ntn AS workshop_ntn,
                w.address AS workshop_address,
                w.city AS workshop_city,
                w.country AS workshop_country,
                w.latitude AS workshop_latitude,
                w.longitude AS workshop_longitude,
                w.is_verified AS workshop_is_verified
         FROM user_profiles p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN workshops w ON p.user_id = w.user_id
         WHERE p.user_id = ?`,
        [userId]
      );

      if (results.length === 0) {
        throw new Error('Profile not found');
      }

      return results[0];
    } catch (error) {
      throw new Error(`Failed to get profile: ${error.message}`);
    }
  }

  async updateProfile(userId, profileData) {
    try {
      const profileUpdateFields = {};
      const workshopUpdateFields = {};

      const profileAllowedFields = [
        'full_name',
        'phone_number',
        'address',
        'city',
        'country',
        'cnic'
      ];

      const workshopAllowedFields = [
        'business_name',
        'workshop_ntn',
        'workshop_city',
        'workshop_country',
        'workshop_address',
        'workshop_latitude',
        'workshop_longitude'
      ];

      profileAllowedFields.forEach(field => {
        if (profileData[field] !== undefined) {
          profileUpdateFields[field] = profileData[field];
        }
      });

      workshopAllowedFields.forEach(field => {
        if (profileData[field] !== undefined) {
          workshopUpdateFields[field] = profileData[field];
        }
      });

      if (
        Object.keys(profileUpdateFields).length === 0 &&
        Object.keys(workshopUpdateFields).length === 0
      ) {
        throw new Error('No fields to update');
      }

      if (Object.keys(profileUpdateFields).length > 0) {
        const setClause = Object.keys(profileUpdateFields)
          .map(key => `${key} = ?`)
          .join(', ');
        const values = [...Object.values(profileUpdateFields), userId];

        await this.db.query(
          `UPDATE user_profiles SET ${setClause} WHERE user_id = ?`,
          values
        );
      }

      if (Object.keys(workshopUpdateFields).length > 0) {
        const mapped = {};
        if (workshopUpdateFields.business_name !== undefined) {
          mapped.name = workshopUpdateFields.business_name;
        }
        if (workshopUpdateFields.workshop_ntn !== undefined) {
          mapped.ntn = workshopUpdateFields.workshop_ntn;
        }
        if (workshopUpdateFields.workshop_address !== undefined) {
          mapped.address = workshopUpdateFields.workshop_address;
        }
        if (workshopUpdateFields.workshop_city !== undefined) {
          mapped.city = workshopUpdateFields.workshop_city;
        }
        if (workshopUpdateFields.workshop_country !== undefined) {
          mapped.country = workshopUpdateFields.workshop_country;
        }
        if (workshopUpdateFields.workshop_latitude !== undefined) {
          mapped.latitude = workshopUpdateFields.workshop_latitude;
        }
        if (workshopUpdateFields.workshop_longitude !== undefined) {
          mapped.longitude = workshopUpdateFields.workshop_longitude;
        }

        if (Object.keys(mapped).length > 0) {
          const setWorkshopClause = Object.keys(mapped)
            .map(key => `${key} = ?`)
            .join(', ');
          const workshopValues = [...Object.values(mapped), userId];

          await this.db.query(
            `UPDATE workshops SET ${setWorkshopClause} WHERE user_id = ?`,
            workshopValues
          );
        }
      }

      return await this.getProfile(userId);
    } catch (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  }

  async updateProfileImage(userId, imagePath) {
    try {
      await this.db.query(
        'UPDATE user_profiles SET profile_image = ? WHERE user_id = ?',
        [imagePath, userId]
      );

      return { profile_image: imagePath };
    } catch (error) {
      throw new Error(`Failed to update profile image: ${error.message}`);
    }
  }

  async getProfileById(userId, requestingUserId, userRole) {
    try {
      if (userRole !== 'admin' && userId !== requestingUserId) {
        throw new Error('Access denied');
      }

      const results = await this.db.query(
        `SELECT p.*,
                u.email,
                u.role,
                u.is_verified,
                u.is_active,
                u.created_at,
                w.name AS business_name,
                w.ntn AS workshop_ntn,
                w.address AS workshop_address,
                w.city AS workshop_city,
                w.country AS workshop_country,
                w.latitude AS workshop_latitude,
                w.longitude AS workshop_longitude,
                w.is_verified AS workshop_is_verified
         FROM user_profiles p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN workshops w ON p.user_id = w.user_id
         WHERE p.user_id = ?`,
        [userId]
      );

      if (results.length === 0) {
        throw new Error('Profile not found');
      }

      return results[0];
    } catch (error) {
      throw new Error(`Failed to get profile by ID: ${error.message}`);
    }
  }

  async isProfileComplete(userId) {
    try {
      const profile = await this.getProfile(userId);

      const requiredFields = ['full_name', 'phone_number', 'city'];
      
      return requiredFields.every(field => 
        profile[field] && profile[field].trim() !== ''
      );
    } catch (error) {
      throw new Error(`Failed to check profile completion: ${error.message}`);
    }
  }

  async getProfileCompletionPercentage(userId) {
    try {
      const profile = await this.getProfile(userId);

      const fields = [
        'full_name',
        'phone_number',
        'address',
        'city',
        'country',
        'cnic',
        'profile_image',
        'business_name',
        'workshop_ntn',
        'workshop_city',
        'workshop_country',
        'workshop_address'
      ];

      const completedFields = fields.filter(field => 
        profile[field] && profile[field].toString().trim() !== ''
      );

      return Math.round((completedFields.length / fields.length) * 100);
    } catch (error) {
      throw new Error(`Failed to calculate profile completion: ${error.message}`);
    }
  }
}

module.exports = new ProfileService();