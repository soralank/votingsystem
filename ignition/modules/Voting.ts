import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VotingModule = buildModule("VotingModule", (m) => {
  const voting = m.contract("ElectionsManager");

  return { voting };
});

export default VotingModule;
