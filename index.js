const fs = require("fs");
const config = require("./config");

const PORTFOLIO_FILE = "./portfolio.json";

const CHECK_INTERVAL_SECONDS = 5;
const TRADE_SCORE_THRESHOLD = 75;
const TAKE_PROFIT_PERCENT = 0.0015; // +0.15%
const STOP_LOSS_PERCENT = 0.0010;   // -0.10%
const MAX_OPEN_POSITIONS = 3;
const MAX_POSITION_MINUTES = 1;
const priceHistory = {};

console.log("🚀 AI-Style Coinbase Sniper Bot Started");
console.log("Mode:", config.BOT_MODE);
console.log("Real Trading Enabled:", config.REAL_TRADING_ENABLED);
console.log("Watching:", config.COINS.join(", "));
console.log("Smart Score Threshold:", TRADE_SCORE_THRESHOLD);
console.log("Max Open Positions:", MAX_OPEN_POSITIONS);
console.log("----------------------------------");

function loadPortfolio() {
  if (!fs.existsSync(PORTFOLIO_FILE)) {
    return {
      startingBalance: 500,
      currentBalance: 500,
      wins: 0,
      losses: 0,
      trades: [],
      openPositions: []
    };
  }

  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf8"));

  if (!portfolio.trades) portfolio.trades = [];
  if (!portfolio.openPositions) portfolio.openPositions = [];

  return portfolio;
}

function savePortfolio(portfolio) {
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
}

async function getCoinbasePrice(symbol) {
  const url = `https://api.coinbase.com/v2/prices/${symbol}/spot`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${symbol}`);
  }

  const data = await response.json();
  return Number(data.data.amount);
}

function updatePriceHistory(symbol, price) {
  if (!priceHistory[symbol]) priceHistory[symbol] = [];

  priceHistory[symbol].push({
    price,
    time: Date.now()
  });

  if (priceHistory[symbol].length > 20) {
    priceHistory[symbol].shift();
  }
}

function smartAIScore(symbol) {
  const history = priceHistory[symbol];

if (!history || history.length < 5) {
  return {
    symbol,
    score: 50,
    currentPrice: history && history.length > 0 ? history[history.length - 1].price : null,
    reason: "Not enough data yet"
  };
}

  const first = history[0].price;
  const last = history[history.length - 1].price;
  const previous = history[history.length - 2].price;

  const shortMove = ((last - previous) / previous) * 100;
  const trendMove = ((last - first) / first) * 100;

  const prices = history.map(p => p.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const volatility = ((high - low) / last) * 100;

  let score = 55;
  let reasons = [];

  if (trendMove > 0.02) {
    score += 10;
    reasons.push("positive trend");
  }

  if (trendMove > 0.08) {
    score += 15;
    reasons.push("strong trend");
  }

  if (shortMove > 0.01) {
    score += 10;
    reasons.push("fresh momentum");
  }

  if (shortMove > 0.05) {
    score += 15;
    reasons.push("strong momentum");
  }

  if (volatility > 0.15 && volatility < 1.8) {
    score += 10;
    reasons.push("tradable volatility");
  }

  if (trendMove < -0.20) {
    score -= 15;
    reasons.push("weak trend");
  }

  if (shortMove < -0.15) {
    score -= 15;
    reasons.push("negative momentum");
  }

  if (volatility > 3) {
    score -= 10;
    reasons.push("too volatile");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    symbol,
    score,
    currentPrice: last,
    trendMove,
    shortMove,
    volatility,
    reason: reasons.join(", ") || "neutral"
  };
}

function hasOpenPosition(portfolio, symbol) {
  return portfolio.openPositions.some(pos => pos.symbol === symbol);
}

function openPaperTrade(portfolio, setup) {
  if (portfolio.openPositions.length >= MAX_OPEN_POSITIONS) {
    console.log("🛑 Max open positions reached.");
    return;
  }

  if (hasOpenPosition(portfolio, setup.symbol)) {
    console.log(`🛑 Already open: ${setup.symbol}`);
    return;
  }

  const tradeSize = portfolio.currentBalance * config.MAX_TRADE_PERCENT;

  const position = {
    dateOpened: new Date().toISOString(),
    symbol: setup.symbol,
    tradeSize: Number(tradeSize.toFixed(2)),
    entryPrice: Number(setup.currentPrice.toFixed(2)),
    takeProfitPrice: Number((setup.currentPrice * (1 + TAKE_PROFIT_PERCENT)).toFixed(2)),
    stopLossPrice: Number((setup.currentPrice * (1 - STOP_LOSS_PERCENT)).toFixed(2)),
    scoreAtEntry: setup.score,
    reason: setup.reason
  };

  portfolio.openPositions.push(position);
  savePortfolio(portfolio);

  console.log("📌 AI PAPER POSITION OPENED");
  console.log(position);
}

async function checkOpenPositions(portfolio) {
  const stillOpen = [];

  for (const position of portfolio.openPositions) {
    const currentPrice = await getCoinbasePrice(position.symbol);

    const movePercent =
      ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    const minutesOpen =
      (Date.now() - new Date(position.dateOpened).getTime()) / 60000;

    console.log("----------------------------------");
    console.log("📍 Monitoring:", position.symbol);
    console.log("Entry:", "$" + position.entryPrice);
    console.log("Current:", "$" + currentPrice.toFixed(2));
    console.log("Take Profit:", "$" + position.takeProfitPrice);
    console.log("Stop Loss:", "$" + position.stopLossPrice);
    console.log("Move:", movePercent.toFixed(2) + "%");
    console.log("Minutes Open:", minutesOpen.toFixed(1));

    let result = null;

    if (currentPrice >= position.takeProfitPrice) result = "WIN";
    if (currentPrice <= position.stopLossPrice) result = "LOSS";

    if (!result && minutesOpen >= MAX_POSITION_MINUTES) {
      result = movePercent >= 0 ? "TIMEOUT_WIN" : "TIMEOUT_LOSS";
    }

    if (!result) {
      console.log("⏳ Position still open.");
      stillOpen.push(position);
      continue;
    }

    const profitPercent =
      (currentPrice - position.entryPrice) / position.entryPrice;

    const profitLoss = position.tradeSize * profitPercent;

    portfolio.currentBalance += profitLoss;

    const closedTrade = {
      dateOpened: position.dateOpened,
      dateClosed: new Date().toISOString(),
      symbol: position.symbol,
      tradeSize: position.tradeSize,
      entryPrice: position.entryPrice,
      exitPrice: Number(currentPrice.toFixed(2)),
      profitLoss: Number(profitLoss.toFixed(2)),
      result
    };

    portfolio.trades.push(closedTrade);

    if (profitLoss > 0) portfolio.wins++;
    else portfolio.losses++;

    console.log(result.includes("WIN") ? "✅ POSITION CLOSED PROFIT" : "🛑 POSITION CLOSED LOSS");
    console.log(closedTrade);
  }

  portfolio.openPositions = stillOpen;
  savePortfolio(portfolio);
}

async function scanForTrades(portfolio) {
  const setups = [];

  console.log("📡 AI scanning market...");

  for (const symbol of config.COINS) {
    try {
      const price = await getCoinbasePrice(symbol);
      updatePriceHistory(symbol, price);

      const setup = smartAIScore(symbol);
      setups.push(setup);

      console.log(
        `${symbol}: $${price.toFixed(2)} | AI Score: ${setup.score} | ${setup.reason}`
      );
    } catch (error) {
      console.log(`❌ ${symbol}: ${error.message}`);
    }
  }

setups.sort((a, b) => b.score - a.score);

for (const setup of setups) {
  if (portfolio.openPositions.length >= MAX_OPEN_POSITIONS) break;
  if (hasOpenPosition(portfolio, setup.symbol)) continue;
  if (!setup.currentPrice) continue;

  if (setup.score >= 70) {
    console.log(`🚀 HIGH CONFIDENCE TRADE: ${setup.symbol} | Score: ${setup.score}`);
    openPaperTrade(portfolio, setup);
    continue;
  }

  if (setup.score >= TRADE_SCORE_THRESHOLD) {
    console.log(`✅ TRADE EXECUTED: ${setup.symbol} | Score: ${setup.score}`);
    openPaperTrade(portfolio, setup);
  }
}
}

function printReport(portfolio) {
  const totalTrades = portfolio.wins + portfolio.losses;
  const winRate = totalTrades > 0 ? (portfolio.wins / totalTrades) * 100 : 0;

  console.log("----------------------------------");
  console.log("📊 PAPER TRADING REPORT");
  console.log("Starting Balance: $" + portfolio.startingBalance.toFixed(2));
  console.log("Current Balance: $" + portfolio.currentBalance.toFixed(2));
  console.log("Profit/Loss: $" + (portfolio.currentBalance - portfolio.startingBalance).toFixed(2));
  console.log("Total Closed Trades:", totalTrades);
  console.log("Wins:", portfolio.wins);
  console.log("Losses:", portfolio.losses);
  console.log("Win Rate:", winRate.toFixed(2) + "%");
  console.log("Open Positions:", portfolio.openPositions.length);

  for (const pos of portfolio.openPositions) {
    console.log(`- ${pos.symbol} | Entry: $${pos.entryPrice}`);
  }

  console.log("----------------------------------");
}

async function runBotCycle() {
  let portfolio = loadPortfolio();

  console.log("\n🔄 New AI market scan:", new Date().toISOString());
  console.log("Current Balance: $" + portfolio.currentBalance.toFixed(2));
  console.log("----------------------------------");

  await checkOpenPositions(portfolio);

  portfolio = loadPortfolio();

  await scanForTrades(portfolio);

  printReport(loadPortfolio());
}

async function startBot() {
  console.log(`✅ AI bot watching every ${CHECK_INTERVAL_SECONDS} seconds.`);

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
