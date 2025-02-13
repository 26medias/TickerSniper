const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');

const history = new TickerData({
    data_dir: "./data",
    timeframe: "1 day",
    ticker: "NVDA",
    refreshInterval: 30000, // refresh every 30 seconds
    isStock: true,          // use market hours logic for stocks
    minDatapoints: 50,      // ensure at least 50 data points are loaded
    onTick: (timestamp, open, high, low, close) => {
        console.log(`Tick at ${timestamp}: O:${open} H:${high} L:${low} C:${close}`);
    }
});

history.start(); // Start monitoring

// Later you can stop monitoring:
// history.stop();
console.log(history.isRunning); // true if running
console.log(history.data(5));  // Get the last 50 data points
const closes = history.data().map(item => item.close);
console.log(closes)
const marketCycleCalc = new MarketCycle(closes);
const result = marketCycleCalc.mc(14, 20);
console.log(result);