const { ethers } = require("hardhat");

const rawPk = (process.env.PRIVATE_KEY || '').trim();
const normalizedPk = rawPk ? (rawPk.startsWith('0x') ? rawPk : `0x${rawPk}`) : '';

async function main() {
  // try to get Hardhat signers first (works when accounts are provided/unlocked)
  let deployer;
  try {
    const signers = await ethers.getSigners();
    if (signers && signers.length) deployer = signers[0];
  } catch (err) {
    // ignore - fallback below
  }

  // if no signer available, use PRIVATE_KEY from env
  if (!deployer) {
    if (!normalizedPk) {
      throw new Error('No signer available. Start a local node with unlocked accounts or set PRIVATE_KEY in the environment.');
    }
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error('RPC_URL is not set in environment.');
    }
    const provider = ethers.provider || new ethers.JsonRpcProvider(rpcUrl);
    deployer = new ethers.Wallet(normalizedPk, provider);
  }

  console.log('Deploying with account:', deployer.address);

  const Factory = await ethers.getContractFactory('ServiceHistoryJSON', deployer);
  const contract = await Factory.deploy();

  // support both ethers v6 (waitForDeployment) and v5 (deployed)
  if (typeof contract.waitForDeployment === 'function') {
    await contract.waitForDeployment();
  } else if (typeof contract.deployed === 'function') {
    await contract.deployed();
  }

  // address property differs across versions
  const address = contract.target || contract.address;
  console.log('ServiceHistoryJSON deployed to:', address);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
