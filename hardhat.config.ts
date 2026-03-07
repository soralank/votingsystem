import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatIgnition from "@nomicfoundation/hardhat-ignition";
import hardhatIgnitionEthers from "@nomicfoundation/hardhat-ignition-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  plugins: [
    hardhatEthers,
    hardhatEthersChaiMatchers,
    hardhatIgnition,
    hardhatIgnitionEthers,
    hardhatMocha,
  ],

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
          viaIR: true,
        },
      },
    },
  },

  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL!,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY!],
      chainId: 11155111,
    },
  },
});