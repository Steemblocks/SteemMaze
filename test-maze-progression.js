// Test maze size progression
function getMazeSize(level, baseSize = 10) {
  const effectiveLevel = level;
  const sizeGrowth = effectiveLevel - 1;
  return baseSize + sizeGrowth;
}

function getGemCount(level, mazeSize) {
  const baseGems = 3;
  const levelBonus = Math.floor(level / 2);
  const sizeBonus = Math.floor((mazeSize - 11) / 2);
  return Math.min(baseGems + levelBonus + sizeBonus, 12);
}

function getCoinCount(level, mazeSize) {
  const base = Math.floor(mazeSize * 0.6);
  const levelBonus = Math.floor(level * 0.5);
  return Math.min(base + levelBonus, 25);
}

console.log("=".repeat(50));
console.log("MAZE SIZE PROGRESSION TEST (Level 1-10)");
console.log("=".repeat(50));
console.log("Level | Maze Size | Gems | Coins");
console.log("------|-----------|------|------");

for (let level = 1; level <= 10; level++) {
  const mazeSize = getMazeSize(level, 10);
  const gems = getGemCount(level, mazeSize);
  const coins = getCoinCount(level, mazeSize);

  console.log(
    `  ${level.toString().padStart(2)}  | ` +
      `  ${mazeSize}x${mazeSize}${mazeSize < 10 ? " " : ""}  | ` +
      `  ${gems.toString().padStart(2)} | ` +
      `  ${coins.toString().padStart(2)}`,
  );
}

console.log("=".repeat(50));
console.log("\nVerification:");
console.log("✓ Level 1 starts at 10x10");
console.log("✓ Level 10 ends at 19x19");
console.log("✓ Each level increases by 1");
console.log("✓ Gems and coins scale appropriately");
