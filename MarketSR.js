class MarketSR {
    constructor(data, options = {}) {
        // Options
        this.pivotLookback = options.pivotLookback ?? 3;
        this.clusterThreshold = options.clusterThreshold ?? 0.5;

        // Sort data by timestamp to ensure correct ordering
        this.data = data.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
    }

    /**
     * Identify major pivot points for supports (lows) and resistances (highs).
     * A pivot high: the highest among N bars before and N bars after.
     * A pivot low : the lowest among N bars before and N bars after.
     */
    getPivotPoints() {
        const pivotHighs = [];
        const pivotLows = [];
        const n = this.pivotLookback;

        // Skip the first/last N bars because they can't form a pivot with incomplete neighbors.
        for (let i = n; i < this.data.length - n; i++) {
            const currentHigh = this.data[i].high;
            const currentLow = this.data[i].low;

            let isPivotHigh = true;
            let isPivotLow = true;

            // Check the N candles before and after
            for (let j = i - n; j <= i + n; j++) {
                if (this.data[j].high > currentHigh) {
                    isPivotHigh = false;
                }
                if (this.data[j].low < currentLow) {
                    isPivotLow = false;
                }
                if (!isPivotHigh && !isPivotLow) break;
            }

            if (isPivotHigh) {
                pivotHighs.push(currentHigh);
            }
            if (isPivotLow) {
                pivotLows.push(currentLow);
            }
        }

        return { pivotHighs, pivotLows };
    }

    /**
     * Cluster an array of numeric values so that points within
     * 'this.clusterThreshold' distance end up in the same cluster.
     */
    clusterLevels(levels) {
        if (!levels.length) return [];

        // Sort the levels so we can easily group nearby points
        levels.sort((a, b) => a - b);

        const clusters = [];
        for (const lvl of levels) {
            let foundCluster = false;

            for (const c of clusters) {
                // If this level is close enough to the cluster's center
                if (Math.abs(lvl - c.center) <= this.clusterThreshold) {
                    // Merge into this cluster
                    c.points.push(lvl);
                    // Update the center (average of points)
                    c.center = c.points.reduce((acc, val) => acc + val, 0) / c.points.length;
                    foundCluster = true;
                    break;
                }
            }

            // If not found a matching cluster, create a new one
            if (!foundCluster) {
                clusters.push({ points: [lvl], center: lvl });
            }
        }

        // Convert to a simpler format: { level, weight }
        return clusters
            .map(c => ({
                level: c.center,
                weight: c.points.length,
            }))
            // Optional: sort by weight descending (so biggest clusters appear first)
            .sort((a, b) => b.weight - a.weight);
    }

    /**
     * Return support levels sorted by significance (weight).
     */
    supports() {
        const { pivotLows } = this.getPivotPoints();
        return this.clusterLevels(pivotLows);
    }

    /**
     * Return resistance levels sorted by significance (weight).
     */
    resistances() {
        const { pivotHighs } = this.getPivotPoints();
        return this.clusterLevels(pivotHighs);
    }
}

module.exports = MarketSR;

/*
// Example usage:
const data = [
    {
        "timestamp": "2024-12-26T05:00:00.000Z",
        "open": 599.5,
        "high": 602.48,
        "low": 598.0825,
        "close": 601.34,
        "volume": 41005317,
        "marketCycle": null,
        "RSI": null
    },
    {
        "timestamp": "2024-12-27T05:00:00.000Z",
        "open": 597.54,
        "high": 597.7761,
        "low": 590.7647,
        "close": 595.01,
        "volume": 64126858,
        "marketCycle": null,
        "RSI": 0
    },
    {
        "timestamp": "2024-12-30T05:00:00.000Z",
        "open": 587.89,
        "high": 591.74,
        "low": 584.41,
        "close": 588.22,
        "volume": 55987123
    },
    // ... more data if available
];

const sr = new MarketSR(data);
console.log("Supports:", sr.supports());
console.log("Resistances:", sr.resistances());
*/