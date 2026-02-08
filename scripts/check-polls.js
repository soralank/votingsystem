async function main() {
  const Voting = await ethers.getContractFactory("Voting");
  const voting = Voting.attach("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");

  const pollsCount = await voting.pollsCount();
  console.log("Total polls:", pollsCount.toString());

  if (pollsCount > 0) {
    for (let i = 1; i <= pollsCount; i++) {
      const poll = await voting.polls(i);
      console.log(`\nPoll #${i}:`);
      console.log("  Title:", poll.title);
      console.log("  Admin:", poll.admin);
      console.log("  Candidates:", poll.optionsCount.toString());
    }
  }
}

main().catch(console.error);
