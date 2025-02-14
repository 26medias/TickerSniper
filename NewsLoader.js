/***********************************************************************
 * 1 tab = 4 spaces
 * DRY, clean code
 * Using a class-based structure
 ***********************************************************************/

"use strict";

const fs = require("fs");
const path = require("path");

// If you're on Node <18, install node-fetch and uncomment this line:
// const fetch = require("node-fetch");

class NewsLoader {
    /**
     * Constructor: receives a data directory (this.data_dir).
     * Throws an error if POLYGON_API_KEY is not in the environment.
     *
     * @param {string} dataDir - Directory to store JSON and timestamp files
     */
    constructor(dataDir) {
        if (!process.env.POLYGON_API_KEY) {
            throw new Error("Missing environment variable: POLYGON_API_KEY");
        }
        this.apiKey = process.env.POLYGON_API_KEY;

        this.data_dir = dataDir;
        fs.mkdirSync(this.data_dir, { recursive: true });

        this.jsonPath = path.join(this.data_dir, "news.json");
        this.refreshTimePath = path.join(this.data_dir, "news_last_refreshed.txt");
    }

    /**
     * Refresh news data from Polygon.io, and store in JSON.
     *
     * @param {object} [options]
     * @param {number} [options.days=7] - Number of past days to load news
     * @param {number} [options.limit=1000] - Max items per request
     * @param {string[]} [options.symbols] - Optional list of tickers; if provided,
     *                                       fetches each one individually.
     */
    async refresh({ days = 7, limit = 1000, symbols } = {}) {
        const baseUrl = "https://api.polygon.io/v2/reference/news";

        // Calculate UTC date range
        const endDt = new Date(); // UTC "now"
        const startDt = new Date(endDt.getTime() - days * 24 * 60 * 60 * 1000);

        // Format in YYYY-MM-DDTHH:mm:ssZ style
        const publishedGte = startDt.toISOString();
        const publishedLte = endDt.toISOString();

        let aggregatedNews = [];

        // If we have a non-empty array of symbols, fetch each individually
        if (Array.isArray(symbols) && symbols.length > 0) {
            for (const symbol of symbols) {
                const params = new URLSearchParams({
                    ticker: symbol,
                    "published_utc.gte": publishedGte,
                    "published_utc.lte": publishedLte,
                    limit: String(limit),
                    sort: "published_utc",
                    order: "desc",
                    apiKey: this.apiKey
                });

                const url = `${baseUrl}?${params.toString()}`;
                const resp = await fetch(url);
                if (!resp.ok) {
                    console.error(
                        `Error fetching news for ${symbol}: ${resp.status} ${resp.statusText}`
                    );
                    continue;
                }
                const data = await resp.json();
                if (Array.isArray(data.results) && data.results.length > 0) {
                    aggregatedNews.push(...data.results);
                }
            }
        } else {
            // Otherwise, fetch all news ignoring ticker
            const params = new URLSearchParams({
                "published_utc.gte": publishedGte,
                "published_utc.lte": publishedLte,
                limit: String(limit),
                sort: "published_utc",
                order: "desc",
                apiKey: this.apiKey
            });

            const url = `${baseUrl}?${params.toString()}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error(
                    `Error fetching news: ${resp.status} ${resp.statusText}`
                );
            }
            const data = await resp.json();
            if (Array.isArray(data.results)) {
                aggregatedNews = data.results;
            }
        }

        // Cache news to JSON
        fs.writeFileSync(
            this.jsonPath,
            JSON.stringify(aggregatedNews, null, 4),
            "utf8"
        );

        // Update last refreshed timestamp (store epoch seconds)
        fs.writeFileSync(
            this.refreshTimePath,
            (Date.now() / 1000).toString(),
            "utf8"
        );
    }

    /**
     * Returns all cached news as an array of objects.
     */
    listAll() {
        if (!fs.existsSync(this.jsonPath)) {
            return [];
        }
        try {
            const raw = fs.readFileSync(this.jsonPath, "utf8");
            return JSON.parse(raw);
        } catch (error) {
            console.error("Error reading/parsing JSON news cache:", error);
            return [];
        }
    }

    /**
     * Returns only the news items that match a given ticker (case-insensitive).
     * @param {string} ticker
     */
    getByTicker(ticker) {
        const allNews = this.listAll();
        return allNews.filter((item) => {
            // Check if 'tickers' is an array and if it contains the target ticker
            return Array.isArray(item.tickers) && item.tickers.some(
                (t) => t.toLowerCase() === ticker.toLowerCase()
            );
        });
    }

    /**
     * Returns how many seconds ago the data was last refreshed, or null if never.
     */
    lastRefreshed() {
        if (!fs.existsSync(this.refreshTimePath)) {
            return null;
        }
        try {
            const raw = fs.readFileSync(this.refreshTimePath, "utf8").trim();
            const lastTime = parseFloat(raw);
            if (isNaN(lastTime)) {
                return null;
            }
            return (Date.now() / 1000) - lastTime;
        } catch (error) {
            return null;
        }
    }
}

// Example usage
if (require.main === module) {
    (async () => {
        try {
            // We pass in a data directory
            const newsLoader = new NewsLoader("data");

            // If you'd like to fetch news for 2 symbols
            await newsLoader.refresh({
                days: 7,
                limit: 100,
                //symbols: ["AAPL", "PLTR"]
            });
            console.log("Last refreshed:", newsLoader.lastRefreshed(), "seconds ago");

            const allNews = newsLoader.listAll();
            //console.log("All news, sample (first 3):", allNews.slice(0, 3));

            const pltrNews = newsLoader.getByTicker("PLTR");
            console.log("PLTR news, sample (first 3):", pltrNews.slice(0, 3));

            // If you'd like to fetch all news ignoring tickers:
            // await newsLoader.refresh({ days: 7, limit: 100 });
            // ...
        } catch (err) {
            console.error(err);
        }
    })();
}

module.exports = NewsLoader;
