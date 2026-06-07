require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// ===== CONFIG =====
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PORT = process.env.PORT || 5000;

if (!RPC_URL) {
  console.error('ERROR: RPC_URL is not set in .env');
  process.exit(1);
}
if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY is not set in .env');
  process.exit(1);
}
if (!CONTRACT_ADDRESS) {
  console.error('ERROR: CONTRACT_ADDRESS is not set in .env');
  process.exit(1);
}

// Create provider & wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI: keep in sync with your contract (replace with real ABI if different)
const abi = [
  'function addServiceRecord(string vehicleId, string jsonData) public returns (uint256)',
  'function getRecordsByVehicle(string vehicleId) public view returns (uint256[])',
  'function getRecordById(uint256 id) public view returns (string vehicleId, string jsonData, uint256 timestamp)',
  'function recordCount() public view returns (uint256)'
];

async function createContractSafe() {
  // 1) Prevent the very-common mistake: contract address equals your wallet address
  if (wallet.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error(
      `CONTRACT_ADDRESS equals your WALLET address (${wallet.address}).\n` +
      `You must deploy the contract and set CONTRACT_ADDRESS to the deployed contract address (not your wallet).`
    );
  }

  // 2) Verify there's bytecode at the address
  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (!code || code === '0x' || code === '0x0') {
    throw new Error(
      `No contract code found at CONTRACT_ADDRESS (${CONTRACT_ADDRESS}).\n` +
      `Make sure you deployed the contract to the same RPC (RPC_URL=${RPC_URL}) and update CONTRACT_ADDRESS in .env.\n` +
      `To inspect: run a Hardhat console and call ethers.provider.getCode("${CONTRACT_ADDRESS}")`
    );
  }

  // 3) Create contract instance (connected with wallet for send operations)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
  return contract;
}

// create contract once at startup; fail if invalid
let contract;
createContractSafe()
  .then(c => {
    contract = c;
    console.log('Contract instance created at', CONTRACT_ADDRESS);
  })
  .catch(err => {
    console.error('FATAL: contract validation failed:', err.message || err);
    process.exit(1);
  });

// POST /service-record
app.post('/service-record', async (req, res) => {
  try {
    if (!contract) return res.status(500).json({ error: 'Contract not ready' });

    const { vehicleId, report } = req.body;
    if (!vehicleId || !report) return res.status(400).json({ error: 'vehicleId and report required' });

    const jsonString = JSON.stringify(report);

    // send tx
    const tx = await contract.addServiceRecord(vehicleId, jsonString);
    const receipt = await tx.wait();

    // safe attempt to call recordCount (read-only) with robust error handling
    let recordCount = null;
    try {
      const rc = await contract.recordCount();
      // ethers v6 returns BigInt for uint types
      recordCount = rc?.toString?.() ?? String(rc);
    } catch (err) {
      // handle the empty-call (0x) case and provide helpful message
      console.warn('Warning: could not read recordCount after tx. This might mean the ABI or contract is different.');
    }

    res.json({ message: 'Stored on chain', txHash: tx.hash, recordCount });
  } catch (err) {
    console.error('POST /service-record error:', err);
    const msg = (err && err.message) ? err.message : String(err);
    if (msg.includes('could not decode result data') || msg.includes('call revert exception')) {
      return res.status(500).json({
        error: 'ABI mismatch or wrong CONTRACT_ADDRESS: call returned empty data or reverted. Verify deployed contract address and ABI.'
      });
    }
    res.status(500).json({ error: msg });
  }
});

// GET /service-record/:vehicleId
app.get('/service-record/:vehicleId', async (req, res) => {
  try {
    if (!contract) return res.status(500).json({ error: 'Contract not ready' });

    const vehicleId = req.params.vehicleId;
    // call: getRecordsByVehicle
    let ids;
    try {
      ids = await contract.getRecordsByVehicle(vehicleId);
    } catch (err) {
      console.error('call getRecordsByVehicle failed:', err && err.message ? err.message : err);
      return res.status(500).json({ error: 'ABI mismatch or wrong CONTRACT_ADDRESS: call returned empty data.' });
    }

    if (!ids || ids.length === 0) {
      return res.json({ vehicleId, records: [] });
    }

    const out = [];
    for (let i = 0; i < ids.length; i++) {
      // ensure id is a normal number/string
      const idVal = ids[i].toString();
      // getRecordById expects a uint256: pass BigInt or Number as needed
      let rec;
      try {
        rec = await contract.getRecordById(idVal);
      } catch (err) {
        console.error(`getRecordById(${idVal}) failed:`, err);
        return res.status(500).json({ error: 'ABI mismatch or wrong CONTRACT_ADDRESS: call returned empty data for getRecordById.' });
      }
      // rec => [vehicleId, jsonString, timestamp]
      out.push({
        recordId: Number(idVal),
        vehicleId: rec[0],
        report: JSON.parse(rec[1]),
        timestamp: Number(rec[2].toString())
      });
    }
    
    res.json({ vehicleId, records: out });
  } catch (err) {
    console.error('GET /service-record/:vehicleId error:', err);
    const msg = (err && err.message) ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => console.log('Backend listening on', PORT));
