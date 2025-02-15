const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');
const RedditTracker = require('./RedditTracker');
const NewsLoader = require('./NewsLoader');
const PaperTrading = require('./PaperTrading');
const Options = require('./Options');
const NodeChart = require('./NodeChart');

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
        this.trading = new PaperTrading(this.data_dir);
        this.options = new Options();
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
        const scope = this;
        let output = {};

        const count = 10;
        const history = this.datastore[timeframe];

        // Get the reddit data
        const redditData = this.reddit.get("PLTR");
        output.reddit_mentions = redditData.mentions;
        output.reddit_mentions_24h_ago = redditData.mentions_24h_ago;
        output.reddit_upvotes = redditData.upvotes;
        output.reddit_upvotes = redditData.upvotes;
        output.reddit_rank = redditData.rank;
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


        // Portfolio
        output.cash_balance = this.trading.getAccountBalance();
        console.log("getPortfolio()", JSON.stringify(this.trading.getPortfolio(), null, 4))
        const ticker_positions = this.trading.getPortfolio().filter(item => {
            return item.symbol == this.ticker || item.underlying == scope.ticker
        });
        console.log("ticker_positions", JSON.stringify(ticker_positions, null, 4))
        output.open_positions = ticker_positions.length==0 ? "None" : JSON.stringify(ticker_positions, null, 4);

        // Options contracts
        const d = new Date(last.timestamp);
        const day = "2025-02-21"//d.toISOString().split("T")[0]; @DEBUG
        let contracts = await this.options.getAvailableContracts(this.ticker, day);
        contracts = contracts.filter(item => {
            return Math.abs((output.current_price-item.strike_price)/output.current_price) <= 0.01
        })
        //console.log(day, contracts)
        output.option_contracts = JSON.stringify(contracts, null, 4);

        // Historical data
        const last_points = last50.slice(last50.length-count);
        const history_data = last_points.map(item => {
            const date = new Date(item.timestamp).toLocaleDateString();
            const time = new Date(item.timestamp).toLocaleTimeString();
            return [
                `[${date} ${time}]`,
                `Open: $${item.open.toFixed(2)}`,
                `Close: $${item.close.toFixed(2)}`,
                `Volume: ${item.volume}`,
                `RSI: ${item.RSI.toFixed(2)}`,
                `MarketCycle: ${item.marketCycle.toFixed(2)}`,
            ].join("\n")
        }).join("\n\n")

        output.history_data = history_data;

        // News
        /*await this.newsLoader.refresh({
            days: 7,
            limit: 100,
            symbols: [this.ticker]
        });*/
        const news = this.newsLoader.getByTicker(this.ticker);

        const newsAgeThreshold = 1000*60*60*24*3;

        const newsSummary = news.filter(item => {
            return new Date().getTime()-new Date(item.published_utc).getTime() <= newsAgeThreshold;
        }).map(item => {
            const date = new Date(item.published_utc).toLocaleDateString();
            const time = new Date(item.published_utc).toLocaleTimeString();
            const insights = item.insights.find(insight => insight.ticker == this.ticker)
            return [
                `[${date} ${time}]`,
                `Description: ${item.description}.\n${insights.sentiment_reasoning}`,
                `Sentiment: ${insights.sentiment}`,
            ].join('\n')
        }).join('\n\n');
        output.news = newsSummary;

        console.log(output)

        //console.log(JSON.stringify(news, null, 4));
        return output;
    }
}

const sniper = new Sniper()
sniper.init();

/*
TODO:
- [x] Filter news
- [x] Aggregate/format news
- [ ] Integrate portfolio
- [ ] Integrate options tracking
*/