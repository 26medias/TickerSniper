const fs = require('fs');
const path = require('path');
const axios = require('axios');

class TickerData {
    constructor(options) {
        const {
            data_dir,
            timeframe,
            ticker,
            onTick,
            refreshInterval = 30000, // 30 sec
            isStock = false,
            minDatapoints = 50
        } = options;
        this.dataDir = data_dir;
        this.timeframe = timeframe;
        this.ticker = ticker;
        this.onTick = onTick;
        this.refreshInterval = refreshInterval;
        this.isStock = isStock;
        this.minDatapoints = minDatapoints;
        this.isRunning = false;
        this.cacheFile = path.join(this.dataDir, `${this.ticker}_${this.timeframe.replace(/ /g, '_')}.json`);
        this.historicalData = [];
        // Use your Polygon API key from an environment variable
        this.apiKey = process.env.POLYGON_API_KEY || '';
        if (!this.apiKey) {
            console.warn('Warning: POLYGON_API_KEY not set.');
        }
        this.refreshTimer = null;
    }

    async loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const fileData = fs.readFileSync(this.cacheFile, 'utf8');
                this.historicalData = JSON.parse(fileData);
                console.log('Cache loaded:', this.historicalData.length, 'data point(s).');
            }
        } catch (err) {
            console.error('Error loading cache:', err);
        }
    }

    async saveCache() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.historicalData, null, 4));
        } catch (err) {
            console.error('Error saving cache:', err);
        }
    }

    getPolygonTimespan() {
        // Assumes timeframe like "1 minute", "5 minute", "1 day", etc.
        const parts = this.timeframe.split(' ');
        const multiplier = parts[0];
        const unit = parts[1].toLowerCase();
        let timespan;
        if (unit.startsWith('min')) {
            timespan = 'minute';
        } else if (unit.startsWith('hour')) {
            timespan = 'hour';
        } else if (unit.startsWith('day')) {
            timespan = 'day';
        } else {
            timespan = 'minute';
        }
        return { multiplier, timespan };
    }

    getTimeframeMs() {
        // Converts a timeframe like "1 minute" into milliseconds
        const parts = this.timeframe.split(' ');
        const value = parseInt(parts[0], 10);
        const unit = parts[1].toLowerCase();
        let ms = 60000; // default: minute in ms
        if (unit.startsWith('min')) {
            ms = 60000;
        } else if (unit.startsWith('hour')) {
            ms = 3600000;
        } else if (unit.startsWith('day')) {
            ms = 86400000;
        }
        return value * ms;
    }

    getCandleStart(timestamp) {
        // Floors the given timestamp to the start of the timeframe window
        const date = new Date(timestamp);
        const timeframeMs = this.getTimeframeMs();
        const floored = Math.floor(date.getTime() / timeframeMs) * timeframeMs;
        return new Date(floored).toISOString();
    }

    updateHistoricalData(newData) {
        // Merge newData with cached data, replacing overlapping candles.
        if (this.historicalData.length === 0) {
            this.historicalData = newData;
        } else {
            const newStart = new Date(newData[0].timestamp).getTime();
            const idx = this.historicalData.findIndex(candle => new Date(candle.timestamp).getTime() >= newStart);
            if (idx === -1) {
                this.historicalData = this.historicalData.concat(newData);
            } else {
                this.historicalData = this.historicalData.slice(0, idx).concat(newData);
            }
        }
    }

    /**
     * Compute an effective "to" timestamp.
     * For stocks, if current time is after market close (>= 4pm local),
     * we set effectiveTo to today at 4:00 PM.
     * If before market open (< 9am), we use yesterday's 4:00 PM.
     * Otherwise, effectiveTo is now.
     */
    getEffectiveTo() {
        const now = new Date();
        if (this.isStock) {
            if (now.getHours() >= 16) {
                const marketClose = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);
                return marketClose.getTime();
            } else if (now.getHours() < 9) {
                let previous = new Date(now);
                previous.setDate(now.getDate() - 1);
                previous.setHours(16, 0, 0, 0);
                return previous.getTime();
            }
        }
        return now.getTime();
    }

    async fetchHistoricalData() {
        const timeframeMs = this.getTimeframeMs();
        const effectiveTo = this.getEffectiveTo();
        let startTime;
        // If not enough cached data, fetch at least minDatapoints ending at effectiveTo.
        if (this.historicalData.length < this.minDatapoints) {
            startTime = new Date(effectiveTo - timeframeMs * (this.minDatapoints - 1));
        } else {
            // Otherwise, update from the last candle (with one timeframe overlap).
            const lastCandle = this.historicalData[this.historicalData.length - 1];
            const lastCandleTime = new Date(lastCandle.timestamp).getTime();
            // If our last candle is later than effectiveTo (can happen at market close), adjust.
            if (lastCandleTime > effectiveTo) {
                startTime = new Date(effectiveTo - timeframeMs);
            } else {
                startTime = new Date(lastCandleTime - timeframeMs);
            }
        }

        const from = startTime.getTime();
        const to = effectiveTo;

        const { multiplier, timespan } = this.getPolygonTimespan();
        const url = `https://api.polygon.io/v2/aggs/ticker/${this.ticker}/range/${multiplier}/${timespan}/${from}/${to}?apiKey=${this.apiKey}`;
        console.log('Fetching historical data from:', url);

        try {
            const response = await axios.get(url);
            if (response.data && response.data.results) {
                const newData = response.data.results.map(bar => ({
                    timestamp: new Date(bar.t).toISOString(), // bar.t is in ms
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    close: bar.c,
                    volume: bar.v
                }));
                // Merge newData with cached historical data.
                this.updateHistoricalData(newData);
                await this.saveCache();
                console.log('Historical data updated. Total data points:', this.historicalData.length);
                // Notify via callback with the latest candle.
                const latest = this.historicalData[this.historicalData.length - 1];
                if (typeof this.onTick === 'function') {
                    this.onTick(latest.timestamp, latest.open, latest.high, latest.low, latest.close);
                }
            } else {
                console.warn('No historical data received from Polygon.');
            }
        } catch (err) {
            console.error('Error fetching historical data:', err);
        }
    }

    // Called periodically to refresh data via HTTP.
    async refreshData() {
        await this.fetchHistoricalData();
    }

    // Checks if current time is within market hours (9AM–4PM local, Mon–Fri).
    isMarketOpen() {
        const now = new Date();
        const day = now.getDay(); // 0=Sunday, 6=Saturday
        if (day === 0 || day === 6) return false;
        const hour = now.getHours();
        return hour >= 9 && hour < 16;
    }

    // Calculates delay until the next market open time.
    getDelayUntilMarketOpen() {
        const now = new Date();
        let nextOpen = new Date(now);
        const day = now.getDay();
        if (day === 6) { // Saturday -> Monday
            nextOpen.setDate(now.getDate() + 2);
        } else if (day === 0) { // Sunday -> Monday
            nextOpen.setDate(now.getDate() + 1);
        } else if (now.getHours() >= 16) {
            // After market close, next open is tomorrow.
            nextOpen.setDate(now.getDate() + 1);
        } else if (now.getHours() < 9) {
            nextOpen.setHours(9, 0, 0, 0);
            return nextOpen.getTime() - now.getTime();
        }
        nextOpen.setHours(9, 0, 0, 0);
        while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6) {
            nextOpen.setDate(nextOpen.getDate() + 1);
            nextOpen.setHours(9, 0, 0, 0);
        }
        return nextOpen.getTime() - now.getTime();
    }

    /**
     * Starts the refresh cycle.
     * For stocks:
     *   - If market is open, we poll every refreshInterval.
     *   - If market is closed, we perform one fetch (which will adjust “to” to market close)
     *     and then schedule the next refresh at the next market open.
     */
    startRefreshCycle() {
        if (this.isStock && !this.isMarketOpen()) {
            // Market closed: fetch historical data once (using adjusted "to")...
            this.refreshData();
            const delay = this.getDelayUntilMarketOpen();
            console.log(
                `Market closed. Fetched historical data up to market close. Next refresh scheduled in ${Math.ceil(delay / 60000)} minute(s) at ${new Date(Date.now() + delay).toLocaleTimeString()}.`
            );
            this.refreshTimer = setTimeout(() => {
                this.startRefreshCycle();
            }, delay);
            return;
        }
        // Otherwise (if not a stock or market is open), start a regular refresh interval.
        this.refreshData(); // immediate refresh
        this.refreshTimer = setInterval(async () => {
            await this.refreshData();
        }, this.refreshInterval);
    }

    async start() {
        this.isRunning = true;
        await this.loadCache();
        await this.fetchHistoricalData();
        this.startRefreshCycle();
    }

    stop() {
        this.isRunning = false;
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.saveCache();
    }

    data(count) {
        if (count) {
            return this.historicalData.slice(-count);
        }
        return this.historicalData;
    }
}

module.exports = TickerData;
