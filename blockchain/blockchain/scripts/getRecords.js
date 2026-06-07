/**
 * node scripts/getRecords.js <contractAddress> <vehicleId>
 */
const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node getRecords.js <contractAddress> <vehicleId>');
    process.exit(1);
  }
  const [contractAddress, vehicleId] = args;
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL is not set in environment.');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const abi = [
    'function getRecordsByVehicle(string memory vehicleId) public view returns (uint256[] memory)',
    'function getRecordById(uint256 id) public view returns (string memory, string memory, uint256)'
  ];
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const ids = await contract.getRecordsByVehicle(vehicleId);
  console.log('Record IDs:', ids);
  for (let i=0;i<ids.length;i++) {
    const id = ids[i].toString();
    const rec = await contract.getRecordById(id);
    console.log('Record', id, '=>', rec);
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
