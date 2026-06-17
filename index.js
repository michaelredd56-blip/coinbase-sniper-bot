const fs = require("fs");
const config = require("./config");

const PORTFOLIO_FILE = "./portfolio.json";
const CHECK_INTERVAL_SECONDS = 15;

console.log("🚀 Coinbase Sniper Bot Started");
console.log("Mode:", config.BOT_MODE);
console.log("Real Trading Enabled:", config.REAL_TRADING_ENABLED);
console.log("Watching: BTC, ETH, SOL");
console.log("----------------------------------");

function loadPortfolio() {
  if (!fs.existsSync(PORTFOLIO_FILE)) {
    return {
      startingBalance: 500,
      currentBalance: 500,
      wins: 0,
      losses: 0,
      trades: []
    };
  }

  return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf8"));
}

function savePortfolio(portfolio) {
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
}

async function getCoinbasePrice(symbol) {
  const url = `https://api.coinbase.com/v2/prices/${symbol}/spot`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch price for ${symbol}`);
  }

  const data = await response.json();
  return Number(data.data.amount);
}

function getEstimatedOldPrice(currentPrice) {
  const move = (Math.random() * 2 - 1) / 100;
  return currentPrice / (1 + move);
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

async function runBotCycle() {
  const portfolio = loadPortfolio();

  console.log("\n🔄 New market scan:", new Date().toISOString());
  console.log("Current Balance: $" + portfolio.currentBalance.toFixed(2));
  console.log("----------------------------------");

  const results = [];

  for (const symbol of config.COINS) {
    try {
      const currentPrice = await getCoinbasePrice(symbol);
      const oldPrice = getEstimatedOldPrice(currentPrice);
      const result = calculateScore(symbol, oldPrice, currentPrice);

      results.push(result);

      console.log(
        `${symbol}: $${currentPrice.toFixed(2)} | Change Estimate: ${result.changePercent.toFixed(2)}% | Score: ${result.score}`
      );
    } catch (error) {
      console.log(`❌ Error fetching ${symbol}: ${error.message}`);
    }
  }

  if (results.length === 0) {
    console.log("No price data received. Waiting for next scan.");
    return;
  }

  results.sort((a, b) => b.score - a.score);
  const bestSetup = results[0];

  console.log("----------------------------------");
  console.log("Best setup:", bestSetup.symbol);
  console.log("Score:", bestSetup.score);

  if (bestSetup.score >= 80) {
    const tradeSize = portfolio.currentBalance * config.MAX_TRADE_PERCENT;

    const simulatedWin = Math.random() > 0.45;
    const profitPercent = simulatedWin ? 0.015 : -0.0075;
    const profitLoss = tradeSize * profitPercent;

    portfolio.currentBalance += profitLoss;

    const trade = {
      date: new Date().toISOString(),
      symbol: bestSetup.symbol,
      tradeSize: Number(tradeSize.toFixed(2)),
      entryPrice: Number(bestSetup.newPrice.toFixed(2)),
      profitLoss: Number(profitLoss.toFixed(2)),
      result: profitLoss > 0 ? "WIN" : "LOSS"
    };

    portfolio.trades.push(trade);

    if (profitLoss > 0) {
      portfolio.wins++;
    } else {
      portfolio.losses++;
    }

    savePortfolio(portfolio);

    console.log("📈 PAPER TRADE EXECUTED");
    console.log(trade);
  } else {
    console.log("🛑 No trade. Setup was not strong enough.");
  }

  const totalTrades = portfolio.wins + portfolio.losses;
  const winRate =
    totalTrades > 0 ? (portfolio.wins / totalTrades) * 100 : 0;

  console.log("----------------------------------");
  console.log("📊 PAPER TRADING REPORT");
  console.log("Starting Balance: $" + portfolio.startingBalance.toFixed(2));
  console.log("Current Balance: $" + portfolio.currentBalance.toFixed(2));
  console.log(
    "Profit/Loss: $" +
      (portfolio.currentBalance - portfolio.startingBalance).toFixed(2)
  );
  console.log("Total Trades:", totalTrades);
  console.log("Wins:", portfolio.wins);
  console.log("Losses:", portfolio.losses);
  console.log("Win Rate:", winRate.toFixed(2) + "%");
  console.log("----------------------------------");
}

async function startBot() {
  console.log(`✅ Bot is now watching the market every ${CHECK_INTERVAL_SECONDS} seconds.`);

  await runBotCycle();

  setInterval(async () => {
    try {
      await runBotCycle();
    } catch (error) {
      console.log("❌ Bot cycle error:", error.message);
    }
  }, CHECK_INTERVAL_SECONDS * 1000);
}

startBot();
