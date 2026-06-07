require('@nomicfoundation/hardhat-toolbox');
require('dotenv/config');

const rawPk = (process.env.PRIVATE_KEY || '').trim();
const normalizedPk = rawPk ? (rawPk.startsWith('0x') ? rawPk : `0x${rawPk}`) : '';
const PRIVATE_KEY_VALID = /^0x[0-9a-fA-F]{64}$/.test(normalizedPk);
if (rawPk && !PRIVATE_KEY_VALID) {
  console.warn('WARNING: PRIVATE_KEY is set but invalid (expected 32 bytes hex). Hardhat will not use it.');
}

module.exports = {
  solidity: '0.8.20',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
      accounts: PRIVATE_KEY_VALID ? [normalizedPk] : []
    },
    sepolia: {
      url: process.env.RPC_URL || '',
      accounts: PRIVATE_KEY_VALID ? [normalizedPk] : []
    }
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};
