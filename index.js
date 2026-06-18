const fs = require("fs");
const config = require("./config");

const PORTFOLIO_FILE = "./portfolio.json";
const CHECK_INTERVAL_SECONDS = 5;

// Trade rules
const TRADE_SCORE_THRESHOLD = 75;
const TAKE_PROFIT_PERCENT = 0.015; // +1.5%
const STOP_LOSS_PERCENT = 0.0075;  // -0.75%

console.log("🚀 Coinbase Sniper Bot Started");
console.log("Mode:", config.BOT_MODE);
console.log("Real Trading Enabled:", config.REAL_TRADING_ENABLED);
console.log("Watching: BTC, ETH, SOL");
console.log("Trade Threshold:", TRADE_SCORE_THRESHOLD);
console.log("Take Profit:", TAKE_PROFIT_PERCENT * 100 + "%");
console.log("Stop Loss:", STOP_LOSS_PERCENT * 100 + "%");
console.log("----------------------------------");

function loadPortfolio() {
  if (!fs.existsSync(PORTFOLIO_FILE)) {
    return {
      startingBalance: 500,
      currentBalance: 500,
      wins: 0,
      losses: 0,
      trades: [],
      openPosition: null
    };
  }

  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf8"));

  if (!portfolio.trades) portfolio.trades = [];
  if (!("openPosition" in portfolio)) portfolio.openPosition = null;

  return portfolio;
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

function openPaperTrade(portfolio, setup) {
  const tradeSize = portfolio.currentBalance * config.MAX_TRADE_PERCENT;

  portfolio.openPosition = {
    dateOpened: new Date().toISOString(),
    symbol: setup.symbol,
    tradeSize: Number(tradeSize.toFixed(2)),
    entryPrice: Number(setup.newPrice.toFixed(2)),
    takeProfitPrice: Number((setup.newPrice * (1 + TAKE_PROFIT_PERCENT)).toFixed(2)),
    stopLossPrice: Number((setup.newPrice * (1 - STOP_LOSS_PERCENT)).toFixed(2)),
    scoreAtEntry: setup.score
  };

  savePortfolio(portfolio);

  console.log("📌 PAPER POSITION OPENED");
  console.log(portfolio.openPosition);
}

async function checkOpenPosition(portfolio) {
  const position = portfolio.openPosition;

  if (!position) return false;

  const currentPrice = await getCoinbasePrice(position.symbol);
  const priceChangePercent =
    ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

  console.log("📍 Monitoring open position");
  console.log("Symbol:", position.symbol);
  console.log("Entry Price:", "$" + position.entryPrice);
  console.log("Current Price:", "$" + currentPrice.toFixed(2));
  console.log("Take Profit:", "$" + position.takeProfitPrice);
  console.log("Stop Loss:", "$" + position.stopLossPrice);
  console.log("Move:", priceChangePercent.toFixed(2) + "%");

  let shouldClose = false;
  let result = null;

  if (currentPrice >= position.takeProfitPrice) {
    shouldClose = true;
    result = "WIN";
  }

  if (currentPrice <= position.stopLossPrice) {
    shouldClose = true;
    result = "LOSS";
  }

  if (!shouldClose) {
    console.log("⏳ Position still open.");
    return true;
  }

  const exitPrice = currentPrice;
  const profitPercent = (exitPrice - position.entryPrice) / position.entryPrice;
  const profitLoss = position.tradeSize * profitPercent;

  portfolio.currentBalance += profitLoss;

  const closedTrade = {
    dateOpened: position.dateOpened,
    dateClosed: new Date().toISOString(),
    symbol: position.symbol,
    tradeSize: position.tradeSize,
    entryPrice: position.entryPrice,
    exitPrice: Number(exitPrice.toFixed(2)),
    profitLoss: Number(profitLoss.toFixed(2)),
    result
  };

  portfolio.trades.push(closedTrade);

  if (profitLoss > 0) {
    portfolio.wins++;
  } else {
    portfolio.losses++;
  }

  portfolio.openPosition = null;

  savePortfolio(portfolio);

  console.log(result === "WIN" ? "✅ TAKE PROFIT HIT" : "🛑 STOP LOSS HIT");
  console.log("📈 PAPER TRADE CLOSED");
  console.log(closedTrade);

  return false;
}

async function scanForNewTrade(portfolio) {
  const results = [];

  console.log("📡 Scanning BTC, ETH, and SOL...");

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
    console.log("No price data received.");
    return;
  }

  results.sort((a, b) => b.score - a.score);
  const bestSetup = results[0];

  console.log("----------------------------------");
  console.log("Best setup:", bestSetup.symbol);
  console.log("Score:", bestSetup.score);

  if (bestSetup.score >= TRADE_SCORE_THRESHOLD) {
    openPaperTrade(portfolio, bestSetup);
  } else {
    console.log("🛑 No trade. Setup was not strong enough.");
  }
}

function printReport(portfolio) {
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
  console.log("Total Closed Trades:", totalTrades);
  console.log("Wins:", portfolio.wins);
  console.log("Losses:", portfolio.losses);
  console.log("Win Rate:", winRate.toFixed(2) + "%");

  if (portfolio.openPosition) {
    console.log("Open Position:", portfolio.openPosition.symbol);
  } else {
    console.log("Open Position: None");
  }

  console.log("----------------------------------");
}

async function runBotCycle() {
  const portfolio = loadPortfolio();

  console.log("\n🔄 New market scan:", new Date().toISOString());
  console.log("Current Balance: $" + portfolio.currentBalance.toFixed(2));
  console.log("----------------------------------");

  if (portfolio.openPosition) {
    await checkOpenPosition(portfolio);
  } else {
    await scanForNewTrade(portfolio);
  }

  printReport(loadPortfolio());
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
