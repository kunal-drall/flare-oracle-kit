import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const COSTON2_RPC =
  process.env["COSTON2_RPC_URL"] ?? "https://coston2-api.flare.network/ext/C/rpc";
const FLARE_RPC =
  process.env["FLARE_RPC_URL"] ?? "https://flare-api.flare.network/ext/C/rpc";
const DEPLOYER_KEY = process.env["DEPLOYER_PRIVATE_KEY"];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    coston2: {
      url: COSTON2_RPC,
      chainId: 114,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
    flare: {
      url: FLARE_RPC,
      chainId: 14,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env["REPORT_GAS"] === "1",
    currency: "USD",
  },
  mocha: {
    timeout: 60_000,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
