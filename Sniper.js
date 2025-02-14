const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');
const NodeChart = require('./NodeChart');
const RedditTracker = require('./RedditTracker');
const NewsLoader = require('./NewsLoader');

/*

*/

class Sniper {
    constructor(ticker="NVDA", data_dir="./data") {
        this.data_dir = data_dir
        this.ticker = ticker;
        this.main_timeframe = "1 minute";
        this.context_timeframe = "1 day";
        this.datastore = {};
        this.data = {};
        this.reddit = new RedditTracker(this.data_dir);
        this.newsLoader = new NewsLoader(this.data_dir);
    }

    init() {
        const scope = this;
        this.datastore[this.main_timeframe] = new TickerData({
            data_dir: this.data_dir,
            timeframe: this.main_timeframe,
            ticker: this.ticker,
            refreshInterval: 60000, // refresh every 60 seconds
            isStock: true,          // use market hours logic for stocks
            minDatapoints: 50,      // ensure at least 50 data points are loaded
            onTick: (timestamp, open, high, low, close) => {
                console.log(`[${this.main_timeframe}] - Tick at ${timestamp}: O:${open} H:${high} L:${low} C:${close}`);
                scope.onMarketDataUpdate(this.main_timeframe);
            }
        });

        this.datastore[this.context_timeframe] = new TickerData({
            data_dir: this.data_dir,
            timeframe: this.context_timeframe,
            ticker: this.ticker,
            refreshInterval: 60000, // refresh every 60 seconds
            isStock: true,          // use market hours logic for stocks
            minDatapoints: 50,      // ensure at least 50 data points are loaded
            onTick: (timestamp, open, high, low, close) => {
                console.log(`[${this.main_timeframe}] - Tick at ${timestamp}: O:${open} H:${high} L:${low} C:${close}`);
                scope.onMarketDataUpdate(this.context_timeframe);
            }
        });
        
        //this.datastore[this.main_timeframe].start();
        //this.datastore[this.context_timeframe].start();

        this.generateReport(this.main_timeframe);
    }

    onMarketDataUpdate(timeframe) {
        /*const data = this.datastore[timeframe].data();
        const closes = data.map(item => item.close);
        const marketCycleCalc = new MarketCycle(closes);
        const mcs = marketCycleCalc.mc(14, 20);

        this.data[timeframe] = data.map((item, n) => {
            item.mc = mcs[n]
            return item;
        });
        this.data[timeframe] = data.filter(item => {
            return item.mc;
        });*/
        this.generateReport(timeframe);
    }

    async generateReport(timeframe) {
        let output = {};

        const count = 10;
        const history = this.datastore[timeframe];

        // Get the reddit data
        const redditData = this.reddit.get("PLTR");
        output.reddit_mentions = redditData.mentions;
        output.reddit_mentions_24h_ago = redditData.mentions_24h_ago;
        output.reddit_upvotes = redditData.upvotes;
        output.rank_upvotes = redditData.upvotes;
        output.reddit_rank_24h_ago = redditData.rank_24h_ago;
        
        // Get the last & last 50 datapoints
        const last = history.data(1)[0];
        let last50 = history.data(50);

        // Set the basic data
        output.ticker = this.ticker;
        output.date = new Date(last.timestamp).toLocaleDateString();
        output.time = new Date(last.timestamp).toLocaleTimeString();
        output.current_price = last.close.toFixed(2);
        output.current_volume = last.volume;

        // Do the computations
        const last50_closes = last50.map(item => item.close);
        const marketCycleCalc = new MarketCycle(last50_closes);
        const marketCycles = marketCycleCalc.mc(14, 20);
        const RSI = marketCycleCalc.RSI(14, 14);
        
        // Assemble the computed data
        last50 = last50.map((item, n) => {
            item["marketCycle"] = marketCycles[n]
            item["RSI"] = RSI[n]
            return item;
        })

        // Set the basic data
        const lastDatapoint = last50[last50.length-1];
        output.current_rsi = lastDatapoint.RSI.toFixed(2);
        output.current_marketcycle = lastDatapoint.marketCycle.toFixed(2);

        // Historical data
        const last_points = last50.slice(last50.length-count);
        const history_data = last_points.map(item => {
            const date = new Date(item.timestamp).toLocaleDateString();
            const time = new Date(item.timestamp).toLocaleTimeString();
            return [
                `[${date} ${time}]`,
                `Open: $${item.open.toFixed(2)}`,
                `Close: $${item.close.toFixed(2)}`,
                `Volume: $${item.volume}`,
                `RSI: $${item.RSI.toFixed(2)}`,
                `MarketCycle: $${item.marketCycle.toFixed(2)}`,
            ].join("\n")
        }).join("\n\n")

        output.history_data = history_data;

        // News
        await this.newsLoader.refresh({
            days: 7,
            limit: 100,
            symbols: [this.ticker]
        });
        const news = this.newsLoader.getByTicker(this.ticker);
        output.news = news;

        console.log(output)
    }
}

const sniper = new Sniper()
sniper.init();

/*
TODO:
- [ ] Filter news?
- [ ] Aggregate/format news
- [ ] Integrate portfolio
- [ ] Integrate options tracking
*/