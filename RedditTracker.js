/***********************************************************************
 * 1 tab = 4 spaces
 * DRY, clean code
 * Using a class-based structure
 ***********************************************************************/

"use strict";

const fs = require("fs");
const path = require("path");

// If using Node.js < 18, uncomment the line below and install node-fetch:
// const fetch = require("node-fetch");

class RedditTracker {
    /**
     * @param {string} dataDir - Directory to store JSON data and timestamp
     */
    constructor(dataDir) {
        this.dataDir = dataDir;
        fs.mkdirSync(this.dataDir, { recursive: true });

        this.jsonPath = path.join(this.dataDir, "reddit_stocks.json");
        this.refreshTimePath = path.join(this.dataDir, "reddit_last_refreshed.txt");
    }

    /**
     * Fetch data from https://apewisdom.io/api/v1.0/filter/all-stocks/page/{page}.
     * If `pages` is undefined or null, it will fetch until the API's total pages.
     * Otherwise, it fetches up to `pages` pages (starting at page=1).
     */
    async refresh(pages = 5) {
        let allResults = [];
        let currentPage = 1;

        while (true) {
            const url = `https://apewisdom.io/api/v1.0/filter/all-stocks/page/${currentPage}`;
            const response = await fetch(url);
            const data = await response.json();

            // If the JSON structure doesn't match, break early
            if (!data.results) {
                break;
            }

            allResults = allResults.concat(data.results);

            // Stop if we've reached the requested number of pages
            if (pages !== undefined && pages !== null && currentPage >= pages) {
                break;
            }

            // Or if we've reached the total number of pages reported by the API
            if ((pages === undefined || pages === null) && data.pages && currentPage >= data.pages) {
                break;
            }

            currentPage++;
        }

        // Write results to JSON
        fs.writeFileSync(this.jsonPath, JSON.stringify(allResults, null, 4), "utf8");

        // Update last refreshed time (store as seconds since epoch)
        fs.writeFileSync(this.refreshTimePath, (Date.now() / 1000).toString(), "utf8");
    }

    /**
     * Return the entire dataset as an array of objects.
     */
    all() {
        if (!fs.existsSync(this.jsonPath)) {
            return [];
        }
        const rawData = fs.readFileSync(this.jsonPath, "utf8");
        try {
            return JSON.parse(rawData);
        } catch (err) {
            // If JSON file is invalid, return empty array
            return [];
        }
    }

    /**
     * Return data for a specific ticker as an object, or null if not found.
     */
    get(ticker) {
        if (!fs.existsSync(this.jsonPath)) {
            return null;
        }

        const rawData = fs.readFileSync(this.jsonPath, "utf8");
        let data;
        try {
            data = JSON.parse(rawData);
        } catch (err) {
            return null;
        }

        if (!Array.isArray(data)) {
            return null;
        }

        // Find the item by ticker
        const found = data.find(
            (item) => item.ticker && item.ticker.toLowerCase() === ticker.toLowerCase()
        );
        return found || null;
    }

    /**
     * Return how many seconds ago the data was last refreshed, or null if never.
     */
    lastRefreshed() {
        if (!fs.existsSync(this.refreshTimePath)) {
            return null;
        }

        const content = fs.readFileSync(this.refreshTimePath, "utf8").trim();
        const lastTime = parseFloat(content);
        if (isNaN(lastTime)) {
            return null;
        }

        // Return difference in seconds
        return (Date.now() / 1000) - lastTime;
    }
}

/*
// --------------------------------------------------
// Example usage (like the Python `if __name__ == "__main__":` block)
// --------------------------------------------------
if (require.main === module) {
    (async () => {
        const tracker = new RedditTracker("data");

        // Fetch up to 3 pages of data from the API and save locally
        await tracker.refresh(3);

        // How many seconds ago was the data refreshed?
        console.log("Last refreshed:", tracker.lastRefreshed(), "seconds ago");

        // Retrieve the entire dataset as an array of objects
        const dataAll = tracker.all();
        console.log("Data sample (first 3 entries):", dataAll.slice(0, 3));

        // Get data for a specific ticker
        const tickerInfo = tracker.get("PLTR");
        if (tickerInfo) {
            console.log("Data for PLTR:", tickerInfo);
        } else {
            console.log("PLTR not found.");
        }
    })();
}
*/
module.exports = RedditTracker;
