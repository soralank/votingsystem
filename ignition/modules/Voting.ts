import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Voting", (m) => {
    const Voting = m.contract("Voting");
    return {Voting};
});