const config = require("./config");

console.log("🚀 Coinbase Sniper Bot Started");
console.log("Mode:", config.BOT_MODE);
console.log("Real Trading Enabled:", config.REAL_TRADING_ENABLED);
console.log("----------------------------------");

const fakePortfolio = {
  startingBalance: 500,
  currentBalance: 500,
  wins: 0,
  losses: 0,
  trades: []
};

async function getCoinbasePrice(symbol) {
  const url = `https://api.coinbase.com/v2/prices/${symbol}/spot`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch price for ${symbol}`);
  }

  const data = await response.json();
  return Number(data.data.amount);
}

function getRandomOldPrice(currentPrice) {
  const fakePreviousMove = (Math.random() * 2 - 1) / 100;
  return currentPrice / (1 + fakePreviousMove);
}

function calculateScore(symbol, oldPrice, newPrice) {
  const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;

  let score = 50;

  if (changePercent > 0.2) score += 10;
  if (changePercent > 0.5) score += 15;
  if (changePercent > 1.0) score += 25;

  if (changePercent < -0.3) score -= 10;
  if (changePercent < -0.7) score -= 20;

  return {
    symbol,
    oldPrice,
    newPrice,
    changePercent,
    score
  };
}

async function runBotOnce() {
  console.log("📡 Pulling live Coinbase prices...");

  const results = [];

  for (const symbol of config.COINS) {
    try {
      const currentPrice = await getCoinbasePrice(symbol);
      const oldPrice = getRandomOldPrice(currentPrice);

      const result = calculateScore(symbol, oldPrice, currentPrice);
      results.push(result);

      console.log(
        `${symbol}: $${currentPrice.toFixed(2)} | Change Estimate: ${result.changePercent.toFixed(2)}% | Score: ${result.score}`
      );
    } catch (error) {
      console.log(`❌ Error fetching ${symbol}:`, error.message);
    }
  }

  if (results.length === 0) {
    console.log("No price data received. Exiting safely.");
    return;
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
      entryPrice: bestSetup.newPrice.toFixed(2),
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
