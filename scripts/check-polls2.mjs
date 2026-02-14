import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const EM = await ethers.getContractFactory("ElectionsManager");
  const em = EM.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");

  const count = Number(await em.getPollsCount());
  console.log("Total polls:", count);

  for (let i = 1; i <= count; i++) {
    const poll = await em.polls(i);
    const totalVotes = await em.getTotalVotes(i);
    const optionsCount = await em.getOptionsCount(i);
    console.log("\n--- Poll #" + i + " ---");
    console.log("  title:", poll.title);
    console.log("  admin:", poll.admin);
    console.log("  exists:", poll.exists);
    console.log("  ended:", poll.ended);
    console.log("  revealed:", poll.revealed);
    console.log("  totalVotes:", totalVotes.toString());
    console.log("  optionsCount:", optionsCount.toString());
    console.log("  startTime:", Number(poll.startTime));
    console.log("  endTime:", Number(poll.endTime));

    for (let j = 1; j <= Number(optionsCount); j++) {
      const opt = await em.getOption(i, j);
      console.log("  option #" + j + ": " + opt[1] + " votes=" + opt[2].toString());
    }
  }
}

main().catch(console.error);
