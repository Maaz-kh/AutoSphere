const fs = require('fs');
const path = require('path');

/**
 * mysql2 SSL options for TiDB Cloud / any MySQL that requires TLS.
 * Set DB_USE_SSL=false in .env to force a plain (non-SSL) connection (useful for localhost).
 * Set DB_SSL_CA in .env to the path of the downloaded CA bundle (.pem) when SSL is enabled.
 * Path can be absolute or relative to the backend process cwd (usually backend/).
 */
function getMysqlSslOptions() {
  const useSslEnv = process.env.DB_USE_SSL;
  const sslExplicitlyDisabled =
    typeof useSslEnv === 'string' && ['false', '0', 'no', 'off'].includes(useSslEnv.trim().toLowerCase());

  if (sslExplicitlyDisabled) {
    return undefined;
  }

  const caPath = process.env.DB_SSL_CA;
  if (!caPath || !String(caPath).trim()) {
    return undefined;
  }

  const resolved = path.isAbsolute(caPath) ? caPath : path.resolve(process.cwd(), caPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`DB_SSL_CA file not found: ${resolved}`);
  }

  return {
    ca: fs.readFileSync(resolved),
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    minVersion: 'TLSv1.2'
  };
}

module.exports = { getMysqlSslOptions };
