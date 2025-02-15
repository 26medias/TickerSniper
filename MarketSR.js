class MarketSR {
    constructor(data, threshold = 0.2) {
        // Sort data by timestamp to ensure proper ordering.
        this.data = data.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
        // Threshold for clustering candidate levels (can be adjusted).
        this.threshold = threshold;
    }

    supports() {
        // Identify candidate supports using local minima on the 'low' field.
        const candidates = [];
        for (let i = 1; i < this.data.length - 1; i++) {
            const prev = this.data[i - 1].low;
            const current = this.data[i].low;
            const next = this.data[i + 1].low;
            if (current < prev && current < next) {
                candidates.push(current);
            }
        }
        return this._clusterLevels(candidates);
    }

    resistances() {
        // Identify candidate resistances using local maxima on the 'high' field.
        const candidates = [];
        for (let i = 1; i < this.data.length - 1; i++) {
            const prev = this.data[i - 1].high;
            const current = this.data[i].high;
            const next = this.data[i + 1].high;
            if (current > prev && current > next) {
                candidates.push(current);
            }
        }
        return this._clusterLevels(candidates);
    }

    _clusterLevels(candidates) {
        // Cluster candidate levels that are within the threshold.
        const clusters = [];
        // Sort candidates to group nearby levels.
        candidates.sort((a, b) => a - b);
        for (const candidate of candidates) {
            let added = false;
            for (const cluster of clusters) {
                if (Math.abs(candidate - cluster.level) <= this.threshold) {
                    // Update the cluster: recalc the weighted (average) level.
                    cluster.sum += candidate;
                    cluster.count += 1;
                    cluster.level = cluster.sum / cluster.count;
                    added = true;
                    break;
                }
            }
            if (!added) {
                clusters.push({ level: candidate, count: 1, sum: candidate });
            }
        }
        // Sort clusters by level.
        clusters.sort((a, b) => a.level - b.level);
        // Return an array of objects with the representative level and its weight.
        return clusters.map(cluster => ({
            level: cluster.level,
            weight: cluster.count
        }));
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