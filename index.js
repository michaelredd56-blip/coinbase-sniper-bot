const config = require("./config");

console.log("🚀 Coinbase Sniper Bot Started");
console.log("Mode:", config.BOT_MODE);
console.log("Real Trading Enabled:", config.REAL_TRADING_ENABLED);
console.log("----------------------------------");

const fakePortfolio = {
  startingBalance: 500,
  currentBalance: 500,
  openTrade: null,
  wins: 0,
  losses: 0,
  trades: []
};

const fakePrices = {
  "BTC-USD": 105000,
  "ETH-USD": 3500,
  "SOL-USD": 150
};

function getRandomMove() {
  return (Math.random() * 4 - 2) / 100;
}

function calculateScore(symbol, oldPrice, newPrice) {
  const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;

  let score = 50;

  if (changePercent > 0.3) score += 20;
  if (changePercent > 0.8) score += 20;
  if (changePercent < -0.5) score -= 20;

  return {
    symbol,
    oldPrice,
    newPrice,
    changePercent,
    score
  };
}

function runBotOnce() {
  console.log("📡 Checking BTC, ETH, and SOL...");

  const results = [];

  for (const symbol of config.COINS) {
    const oldPrice = fakePrices[symbol];
    const move = getRandomMove();
    const newPrice = oldPrice * (1 + move);

    const result = calculateScore(symbol, oldPrice, newPrice);
    results.push(result);

    console.log(
      `${symbol}: $${newPrice.toFixed(2)} | Change: ${result.changePercent.toFixed(2)}% | Score: ${result.score}`
    );
  }

  results.sort((a, b) => b.score - a.score);
  const bestSetup = results[0];

  console.log("----------------------------------");
  console.log("Best setup:", bestSetup.symbol);
  console.log("Score:", bestSetup.score);

  if (bestSetup.score >= 80) {
    const tradeSize = fakePortfolio.currentBalance * config.MAX_TRADE_PERCENT;
    const profitPercent = Math.random() > 0.45 ? 0.015 : -0.0075;
    const profitLoss = tradeSize * profitPercent;

    fakePortfolio.currentBalance += profitLoss;

    const trade = {
      symbol: bestSetup.symbol,
      tradeSize: tradeSize.toFixed(2),
      profitLoss: profitLoss.toFixed(2),
      result: profitLoss > 0 ? "WIN" : "LOSS"
    };

    fakePortfolio.trades.push(trade);

    if (profitLoss > 0) {
      fakePortfolio.wins++;
    } else {
      fakePortfolio.losses++;
    }

    console.log("📈 PAPER TRADE EXECUTED");
    console.log(trade);
  } else {
    console.log("🛑 No trade. Setup was not strong enough.");
  }

  const totalTrades = fakePortfolio.wins + fakePortfolio.losses;
  const winRate =
    totalTrades > 0 ? (fakePortfolio.wins / totalTrades) * 100 : 0;

  console.log("----------------------------------");
  console.log("📊 PAPER TRADING REPORT");
  console.log("Starting Balance: $" + fakePortfolio.startingBalance.toFixed(2));
  console.log("Current Balance: $" + fakePortfolio.currentBalance.toFixed(2));
  console.log(
    "Profit/Loss: $" +
      (fakePortfolio.currentBalance - fakePortfolio.startingBalance).toFixed(2)
  );
  console.log("Wins:", fakePortfolio.wins);
  console.log("Losses:", fakePortfolio.losses);
  console.log("Win Rate:", winRate.toFixed(2) + "%");
  console.log("----------------------------------");
  console.log("✅ Bot run complete. Exiting safely.");
}

runBotOnce();
