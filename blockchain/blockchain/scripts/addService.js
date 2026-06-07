/**
 * node scripts/addService.js <contractAddress> <vehicleId> <jsonString>
 * jsonString should be JSON without spaces or escaped (or pass path and read file)
 */
const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node addService.js <contractAddress> <vehicleId> <jsonString or @file.json>');
    process.exit(1);
  }
  const [contractAddress, vehicleId, jsonArg] = args;
  let jsonString = jsonArg;
  if (jsonArg.startsWith('@')) {
    const path = jsonArg.slice(1);
    jsonString = fs.readFileSync(path, 'utf8');
  }

  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  if (!rpcUrl) throw new Error('RPC_URL is not set in environment.');
  if (!privateKey) throw new Error('PRIVATE_KEY is not set in environment.');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const abi = ['function addServiceRecord(string memory vehicleId, string memory jsonData) public returns (uint256)'];
  const contract = new ethers.Contract(contractAddress, abi, wallet);

  const tx = await contract.addServiceRecord(vehicleId, jsonString);
  const receipt = await tx.wait();
  console.log('Tx hash:', tx.hash);
  console.log('Receipt:', receipt);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
