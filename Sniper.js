const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');
const RedditTracker = require('./RedditTracker');
const NewsLoader = require('./NewsLoader');
const PaperTrading = require('./PaperTrading');
const Options = require('./Options');
const GPT = require('./GPT');
const NodeChart = require('./NodeChart');

/*

*/

class Sniper {
    constructor(ticker="SPY", data_dir="./data") {
        this.data_dir = data_dir
        this.ticker = ticker;
        this.main_timeframe = "1 minute";
        this.context_timeframe = "1 day";
        this.model = "gpt-4o-mini"
        this.llm_interval = 1000*60*2;
        this.last_llm_actions_time = 0;
        this.initial_balance = 10000;
        this.datastore = {};
        this.data = {};

        this.reddit = new RedditTracker(this.data_dir+"/reddit");
        this.newsLoader = new NewsLoader(this.data_dir+"/news");
        this.trading = new PaperTrading(this.data_dir+"/trading");
        this.options = new Options();
        this.gpt = new GPT();

    }

    // Init the market data monitoring
    init() {
        const scope = this;

        if (this.trading.getAccountBalance() <= 0) {
            this.trading.credit(this.initial_balance, "Initial Balance")
        }

        this.datastore[this.main_timeframe] = new TickerData({
            data_dir: this.data_dir,
            timeframe: this.main_timeframe,
            ticker: this.ticker,
            refreshInterval: 60000, // refresh every 60 seconds
            isStock: true,          // use market hours logic for stocks
            minDatapoints: 50,      // ensure at least 50 data points are loaded
            onTick: (timestamp, open, high, low, close) => {
                console.log(`[${this.main_timeframe}] - Tick at ${timestamp}: O:${open} H:${high} L:${low} C:${close}`);
                scope.trading.tick({
                    symbol: scope.ticker,
                    timestamp: new Date(timestamp).toISOString(),
                    open: open,
                    high: high,
                    low: low,
                    close: close,
                    volume: 0
                }, new Date(timestamp));
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
                //scope.onMarketDataUpdate(this.context_timeframe);
            }
        });
        
        this.datastore[this.main_timeframe].start();
        this.datastore[this.context_timeframe].start();

        //this.ask();
    }


    // When there's a tick
    // Decide if we need to call the LLM
    async onMarketDataUpdate(timeframe) {
        let askLLM = false;
        // Refresh reddit
        this.reddit.refresh(10);

        // Refresh the news
        await this.newsLoader.refresh({
            days: 7,
            limit: 100,
            symbols: [this.ticker]
        });
        // New news since last time we checked?
        const lastLLMRequest = new Date().getTime()-this.last_llm_actions_time;
        let news = this.newsLoader.getByTicker(this.ticker);
        news = news.filter(item => {
            return new Date().getTime()-new Date(item.published_utc).getTime() <= lastLLMRequest + 1000*30;
        })

        if (news.length > 0) {
            askLLM = true;
            console.log(`--> ${news.length} news found`);
        }
        if (lastLLMRequest > this.llm_interval) {
            askLLM = true;
            console.log(`--> ${lastLLMRequest} > ${this.llm_interval}`);
        }


        if (askLLM) {
            this.last_llm_actions_time = new Date().getTime();
            this.ask(timeframe);
        }
    }

    // Build the market data for a timeframe: mc, rsi
    buildMarketData(timeframe) {
        const history = this.datastore[timeframe];
        let last50 = history.data(50);
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
        return last50;
    }

    // Generate a report for the LLM
    async generateReport() {
        const scope = this;
        let output = {};

        const count = 10;
        output.count = count;

        const history = this.datastore[this.main_timeframe];

        // Get the reddit data
        const redditData = this.reddit.get(this.ticker);
        output.reddit_mentions = redditData.mentions;
        output.reddit_mentions_24h_ago = redditData.mentions_24h_ago;
        output.reddit_upvotes = redditData.upvotes;
        output.reddit_upvotes = redditData.upvotes;
        output.reddit_rank = redditData.rank;
        output.reddit_rank_24h_ago = redditData.rank_24h_ago;
        
        // Get the last & last 50 datapoints
        const last = history.data(1)[0];
        //let last50 = history.data(50);

        // Set the basic data
        output.ticker = this.ticker;
        output.date = new Date(last.timestamp).toLocaleDateString();
        output.time = new Date(last.timestamp).toLocaleTimeString();
        output.current_price = last.close.toFixed(2);
        output.current_volume = last.volume;

        // Do the computations
       let last50 = this.buildMarketData(this.main_timeframe)
       let last50_daily = this.buildMarketData(this.context_timeframe)
       
        // Set the transformation data
        const lastDatapoint = last50[last50.length-1];
        output.current_rsi = lastDatapoint.RSI.toFixed(2);
        output.current_marketcycle = lastDatapoint.marketCycle.toFixed(2);


        // Portfolio
        output.cash_balance = this.trading.getAccountBalance();
        //console.log("getPortfolio()", JSON.stringify(this.trading.getPortfolio(), null, 4))
        const ticker_positions = this.trading.getPortfolio().filter(item => {
            return item.symbol == this.ticker || item.underlying == scope.ticker
        });
        //console.log("ticker_positions", JSON.stringify(ticker_positions, null, 4))
        output.open_positions = ticker_positions.length==0 ? "None" : JSON.stringify(ticker_positions, null, 4);

        // Options contracts
        const d = new Date(last.timestamp);
        const day = "2025-02-21"//d.toISOString().split("T")[0]; @DEBUG
        let contracts = await this.options.getAvailableContracts(this.ticker, day);
        contracts = contracts.filter(item => {
            return Math.abs((output.current_price-item.strike)/output.current_price) <= 0.01
        })
        //console.log(day, contracts)
        output.option_contracts = JSON.stringify(contracts, null, 4);

        // Historical data
        const history_data = last50.slice(last50.length-count).map(item => {
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
        const history_data_daily = last50_daily.slice(last50_daily.length-count).map(item => {
            const date = new Date(item.timestamp).toLocaleDateString();
            const time = new Date(item.timestamp).toLocaleTimeString();
            return [
                `[${date}]`,
                `Open: $${item.open.toFixed(2)}`,
                `Close: $${item.close.toFixed(2)}`,
                `Volume: ${item.volume}`,
                `RSI: ${item.RSI.toFixed(2)}`,
                `MarketCycle: ${item.marketCycle.toFixed(2)}`,
            ].join("\n")
        }).join("\n\n")

        output.history_data = history_data;
        output.history_data_daily = history_data_daily;

        // News
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

        //console.log(output)

        //console.log(JSON.stringify(news, null, 4));
        return output;
    }

    // Ask the LLM what to do with a report
    async ask() {
        const report = await this.generateReport();
        //console.log(report)
        const sys_prompt = await this.gpt.getPrompt("prompts/actions-system.md")
        const user_prompt = await this.gpt.getPrompt("prompts/actions-user.md", report)
        //console.log("sys_prompt", sys_prompt)
        //console.log("user_prompt", user_prompt)

        const response = await this.gpt.ask(sys_prompt, user_prompt, [], [], this.model) //"o3-mini"
        //console.log("response", JSON.stringify(response, null, 4))

        const message = JSON.parse(response.choices[0].message.content);
        const actions = message.actions;
        const reasonning = message.reasonning;
        console.log(actions);
        console.log(reasonning);

        return await this.act(message);
    }

    // Act on the actions returned
    async act(llm_response) {
        const scope = this;
        const actions = llm_response.actions;
        const reasonning = llm_response.reasonning;
        actions.forEach(item => {
            const last = scope.datastore[scope.main_timeframe].data(1)[0]
            console.log(last)
            switch (item.action) {
                case "buy":
                    scope.trading.buy(
                        scope.ticker,
                        new Date(last.timestamp),
                        item.limitPrice ? item.limitPrice : last.close,
                        item.qty,
                        item.reason,
                        item.limitOrder,
                        item.tif,
                        item.contract
                    )
                break;
                case "sell":
                    scope.trading.close(
                        scope.ticker,
                        new Date(last.timestamp),
                        item.limitPrice ? item.limitPrice : last.close,
                        item.qty,
                        item.reason,
                        item.limitOrder,
                        item.tif,
                        item.contract
                    )
                break;
            }
        });
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