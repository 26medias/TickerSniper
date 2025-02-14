const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');

const history = new TickerData({
    data_dir: "./data",
    timeframe: "1 day",
    ticker: "SPY",
    refreshInterval: 30000, // refresh every 30 seconds
    isStock: true,          // use market hours logic for stocks
    minDatapoints: 50,      // ensure at least 50 data points are loaded
    onTick: (timestamp, open, high, low, close) => {
        console.log(`Tick at ${timestamp}: O:${open} H:${high} L:${low} C:${close}`);
    }
});


const data = history.data(1)
console.log(data)

const getStockData = () => {
    const last = history.data(1)[0];
    const last10 = history.data(10);
    let last50 = history.data(50);
    let output = {};
    output.date = new Date(last.timestamp).toLocaleDateString();
    output.time = new Date(last.timestamp).toLocaleTimeString();
    output.current_price = last.close;
    output.current_volume = last.volume;

    const last50_closes = last50.map(item => item.close);
    const marketCycleCalc = new MarketCycle(last50_closes);
    const marketCycles = marketCycleCalc.mc(14, 20);
    const RSI = marketCycleCalc.RSI(14, 14);
    
    last50 = last50.map((item, n) => {
        item["marketCycle"] = marketCycles[n]
        item["RSI"] = RSI[n]
        return item;
    })
    return last50.slice(last50.length-10)
}
console.log(getStockData(data))