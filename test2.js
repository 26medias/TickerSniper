const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');

const history = new TickerData({
    data_dir: "./data",
    timeframe: "1 minute",
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

var techChart 	= require('./techChart');

candles_data = history.data().map(item => ({
    d: item.timestamp,
    o: item.open,
    h: item.high,
    l: item.low,
    c: item.close,
    v: item.volume,
}))
console.log(candles_data)


var chart = new techChart({
    width: 600,
    height: 300
});
chart.dataset("candles", candles_data);
chart.dataset("line", candles_data.map(item => ({v: item.o})));
chart.init();
chart.render.candles.regular("candles");
chart.render.chart.line("line");
chart.toPNG("render_candles.png", function(response) {
    console.log("response", response);
});

var mcs = new techChart({
    width: 600,
    height: 100
});
mcs.dataset("line", candles_data.map(item => ({v: item.o})));
mcs.init();
mcs.render.chart.line("line");
mcs.toPNG("render_lines.png", function(response) {
    console.log("response", response);
});

const fs = require('fs');
const path = require('path');

const saveCache = async(filename, data) => {
    try {
        fs.writeFileSync(filename, JSON.stringify(data, null, 4));
    } catch (err) {
        console.error('Error saving cache:', err);
    }
}

const output = history.data().map((item, n) => {
    item["mc"] = result[n]
    item["sma200"] = item.close-20;
    return item;
})

console.log(output)

saveCache("output.json", output)