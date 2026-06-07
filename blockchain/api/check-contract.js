const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

(async () => {
  const RPC = process.env.RPC_URL;
  const ADDR = (process.env.CONTRACT_ADDRESS || '').trim();

  if (!RPC) return console.error('Set RPC_URL in blockchain/api/.env');
  if (!ADDR) return console.error('Set CONTRACT_ADDRESS in blockchain/api/.env');

  console.log('RPC_URL=', RPC);
  console.log('CONTRACT_ADDRESS=', ADDR);

  const provider = new ethers.JsonRpcProvider(RPC);

  try {
    const code = await provider.getCode(ADDR);
    console.log('Code at address length:', code ? code.length : '(no code)', code === '0x' ? ' -> NO CODE' : '');
  } catch (e) {
    console.error('Error fetching code:', e.message || e);
  }

  // Minimal ABI entries to test calls
  const abi = [
    'function recordCount() public view returns (uint256)',
    'function getRecordsByVehicle(string) public view returns (uint256[])',
    'function getRecordById(uint256) public view returns (string,string,uint256)'
  ];

  const contract = new ethers.Contract(ADDR, abi, provider);

  // try calling recordCount
  try {
    const rc = await contract.recordCount();
    console.log('recordCount ->', rc.toString());
  } catch (err) {
    console.error('recordCount call failed:', err.message || err);
  }

  // show compiled artifact ABI (if present) to compare
  const artifactPath = path.join(__dirname, '..', 'blockchain', 'artifacts', 'contracts', 'ServiceHistoryJSON.sol', 'ServiceHistoryJSON.json');
  if (fs.existsSync(artifactPath)) {
    const art = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const hasRecordCount = (art.abi || []).some(e => e.type === 'function' && e.name === 'recordCount');
    console.log('Artifact found. ABI includes recordCount():', hasRecordCount);
  } else {
    console.log('Compiled artifact not found at', artifactPath);
  }
})();