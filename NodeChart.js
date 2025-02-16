// NodeChart.js
const NodeCanvas = require('./NodeCanvas');

class NodeChart {
    constructor(options) {
        this.width = options.width;
        this.height = options.height;
        this.data = options.data || [];
        this.padding = options.padding || 0;
        this.panelGap = options.panelGap || 0;
        this.renderAxis = options.renderAxis || { x: true, y: true };
        this.colorScheme = options.colorScheme || {
            candlesticks: {
                up: { r: 0, g: 255, b: 0, a: 255 },
                down: { r: 255, g: 0, b: 0, a: 255 }
            },
            line: { r: 0, g: 0, b: 0, a: 255 },
            spline: { r: 0, g: 0, b: 255, a: 255 },
            bar: { r: 128, g: 128, b: 128, a: 255 },
            verticalLine: { r: 0, g: 0, b: 0, a: 255 },
            horizontalLine: { r: 0, g: 0, b: 0, a: 255 }
        };

        this.panels = [];
        this._layoutPrepared = false;
        this.rendered = false;

        // Initialize the canvas.
        this.canvas = new NodeCanvas();
        this.canvas.init(this.width, this.height);
    }

    /**
     * Adds a panel to the chart.
     * Each panel's `height` property is a unit (weight), not pixels.
     */
    addPanel(panelConfig) {
        if (!panelConfig.id || !panelConfig.height || !Array.isArray(panelConfig.plots)) {
            throw new Error('Panel config must include id, height, and a plots array.');
        }
        this.panels.push(panelConfig);
        return this;
    }

    /**
     * Prepares the layout by computing each panel's bounding box.
     * The panel's pixel height is computed using:
     *   panelPixelHeight = panel.height / (sum of all panel.height values) *
     *                      (canvas.height - 2*padding - total panel gaps)
     */
    prepareLayout() {
        if (this._layoutPrepared) return;

        const totalGaps = this.panelGap * (this.panels.length - 1);
        const availableHeight = this.height - 2 * this.padding - totalGaps;
        const totalUnits = this.panels.reduce((sum, panel) => sum + panel.height, 0);

        let currentY = this.padding;
        this.panels.forEach(panel => {
            const panelPixelHeight = (panel.height / totalUnits) * availableHeight;
            panel.boundingBox = {
                x: this.padding,
                y: currentY,
                width: this.width - 2 * this.padding,
                height: panelPixelHeight
            };
            currentY += panelPixelHeight + this.panelGap;

            // Determine min and max values for the panel if not provided.
            let computedMin = Infinity,
                computedMax = -Infinity;
            panel.plots.forEach(plot => {
                switch (plot.type) {
                    case 'candlesticks':
                        this.data.forEach(d => {
                            let open = d[plot.data.open],
                                high = d[plot.data.high],
                                low = d[plot.data.low],
                                close = d[plot.data.close];
                            computedMin = Math.min(computedMin, open, high, low, close);
                            computedMax = Math.max(computedMax, open, high, low, close);
                        });
                        break;
                    case 'line':
                    case 'spline':
                    case 'bar':
                        if (typeof plot.data.value === 'string') {
                            this.data.forEach(d => {
                                let val = d[plot.data.value];
                                computedMin = Math.min(computedMin, val);
                                computedMax = Math.max(computedMax, val);
                            });
                        } else if (typeof plot.data.value === 'number') {
                            computedMin = Math.min(computedMin, plot.data.value);
                            computedMax = Math.max(computedMax, plot.data.value);
                        }
                        break;
                    case 'horizontal-line':
                        if (typeof plot.data.value === 'number') {
                            computedMin = Math.min(computedMin, plot.data.value);
                            computedMax = Math.max(computedMax, plot.data.value);
                        }
                        break;
                    default:
                        break;
                }
            });
            if (panel.min === undefined) {
                panel.min = computedMin === Infinity ? 0 : computedMin;
            }
            if (panel.max === undefined) {
                panel.max = computedMax === -Infinity ? 1 : computedMax;
            }
            // Ensure a non-zero range.
            if (panel.max === panel.min) {
                panel.max = panel.min + 1;
            }
        });
        this._layoutPrepared = true;
    }

    /**
     * Returns the x coordinate (in pixels) of a datapoint.
     * Uses a bin-center calculation:
     *   binWidth = (canvas.width - 2*padding) / data.length,
     *   x = padding + binWidth/2 + index * binWidth.
     */
    getX(index) {
        const totalX = this.width - 2 * this.padding;
        const binWidth = this.data.length > 0 ? totalX / this.data.length : totalX;
        return this.padding + binWidth / 2 + index * binWidth;
    }

    /**
     * Returns the {x, y} coordinates of a datapoint on the canvas.
     */
    getCoordinates(index, panelId, plotId) {
        this.prepareLayout();
        const panel = this.panels.find(p => p.id === panelId);
        if (!panel) {
            throw new Error(`Panel with id "${panelId}" not found.`);
        }
        const plot = panel.plots.find(p => p.id === plotId);
        if (!plot) {
            throw new Error(`Plot with id "${plotId}" not found in panel "${panelId}".`);
        }
        const x = this.getX(index);
        let value;
        if (plot.type === 'candlesticks') {
            value = this.data[index][plot.data.close];
        } else if (plot.type === 'vertical-line') {
            value = panel.min;
        } else if (typeof plot.data.value === 'string') {
            value = this.data[index][plot.data.value];
        } else if (typeof plot.data.value === 'number') {
            value = plot.data.value;
        } else {
            throw new Error(`Unsupported plot data for plot "${plotId}".`);
        }
        const bb = panel.boundingBox;
        const y = bb.y + bb.height - ((value - panel.min) / (panel.max - panel.min)) * bb.height;
        return { x, y };
    }

    /**
     * Returns the bounding box {x, y, width, height} of the specified panel.
     */
    getBoundingBox(panelId) {
        this.prepareLayout();
        const panel = this.panels.find(p => p.id === panelId);
        if (!panel) {
            throw new Error(`Panel with id "${panelId}" not found.`);
        }
        return panel.boundingBox;
    }

    /**
     * Renders the chart panels and plots on the canvas.
     * Call this method when you want to render the chart.
     * (After rendering, you may add custom drawings on top before saving.)
     */
    render() {
        this.prepareLayout();

        // Optionally render axes.
        if (this.renderAxis.y) {
            this.panels.forEach(panel => {
                const bb = panel.boundingBox;
                this.canvas.line(bb.x, bb.y, bb.x, bb.y + bb.height, { r: 0, g: 0, b: 0, a: 255 });
            });
        }
        if (this.renderAxis.x && this.panels.length > 0) {
            const lastBB = this.panels[this.panels.length - 1].boundingBox;
            this.canvas.line(
                lastBB.x,
                lastBB.y + lastBB.height,
                lastBB.x + lastBB.width,
                lastBB.y + lastBB.height,
                { r: 0, g: 0, b: 0, a: 255 }
            );
        }

        // Render each panel's plots.
        this.panels.forEach(panel => {
            const bb = panel.boundingBox;

            // For most plot types we iterate over each data point.
            this.data.forEach((d, i) => {
                panel.plots.forEach(plot => {
                    let color;
                    switch (plot.type) {
                        case 'candlesticks': {
                            // For candlesticks, use bin-center positioning.
                            const totalX = this.width - 2 * this.padding;
                            const binWidth = this.data.length > 0 ? totalX / this.data.length : totalX;
                            const x = this.padding + binWidth / 2 + i * binWidth;
                            // Interpret the provided width and gap as relative weights.
                            const candleWeight = (plot.width !== undefined ? plot.width : 5);
                            const gapWeight = (plot.gap !== undefined ? plot.gap : 2);
                            const effectiveCandleWidth = binWidth * (candleWeight / (candleWeight + gapWeight));

                            const open = d[plot.data.open],
                                high = d[plot.data.high],
                                low = d[plot.data.low],
                                close = d[plot.data.close];
                            const yOpen = bb.y + bb.height - ((open - panel.min) / (panel.max - panel.min)) * bb.height;
                            const yHigh = bb.y + bb.height - ((high - panel.min) / (panel.max - panel.min)) * bb.height;
                            const yLow = bb.y + bb.height - ((low - panel.min) / (panel.max - panel.min)) * bb.height;
                            const yClose = bb.y + bb.height - ((close - panel.min) / (panel.max - panel.min)) * bb.height;
                            color = close >= open
                                ? (plot.color && plot.color.up ? plot.color.up : this.colorScheme.candlesticks.up)
                                : (plot.color && plot.color.down ? plot.color.down : this.colorScheme.candlesticks.down);

                            // Draw the wick.
                            this.canvas.line(x, yHigh, x, yLow, color);
                            // Draw the body centered in its bin.
                            const bodyX = x - effectiveCandleWidth / 2;
                            const bodyY = Math.min(yOpen, yClose);
                            let bodyHeight = Math.abs(yClose - yOpen);
                            if (bodyHeight < 1) bodyHeight = 1;
                            this.canvas.rect(
                                Math.round(bodyX),
                                Math.round(bodyY),
                                Math.round(effectiveCandleWidth),
                                bodyHeight,
                                color,
                                true
                            );
                            break;
                        }
                        case 'line': {
                            if (i < this.data.length - 1) {
                                const x1 = this.getX(i);
                                const x2 = this.getX(i + 1);
                                const value1 = typeof plot.data.value === 'string' ? this.data[i][plot.data.value] : plot.data.value;
                                const value2 = typeof plot.data.value === 'string' ? this.data[i + 1][plot.data.value] : plot.data.value;
                                const y1 = bb.y + bb.height - ((value1 - panel.min) / (panel.max - panel.min)) * bb.height;
                                const y2 = bb.y + bb.height - ((value2 - panel.min) / (panel.max - panel.min)) * bb.height;
                                color = plot.color ? plot.color : this.colorScheme.line;
                                this.canvas.line(x1, y1, x2, y2, color);
                            }
                            break;
                        }
                        case 'spline': {
                            // Render the spline once per plot.
                            if (i === 0) {
                                const points = [];
                                for (let j = 0; j < this.data.length; j++) {
                                    const x = this.getX(j);
                                    const value = typeof plot.data.value === 'string' ? this.data[j][plot.data.value] : plot.data.value;
                                    const y = bb.y + bb.height - ((value - panel.min) / (panel.max - panel.min)) * bb.height;
                                    points.push({ x, y });
                                }
                                color = plot.color ? plot.color : this.colorScheme.spline;
                                this.canvas.spline(points, color);
                            }
                            break;
                        }
                        case 'bar': {
                            const totalX = this.width - 2 * this.padding;
                            const binWidth = this.data.length > 0 ? totalX / this.data.length : totalX;
                            const x = this.getX(i);
                            const barWidth = binWidth * 0.8; // use 80% of the bin
                            color = plot.color ? plot.color : this.colorScheme.bar;
                            let baselineValue;
                            if (panel.min <= 0 && panel.max >= 0) {
                                baselineValue = 0;
                            } else if (panel.min >= 0) {
                                baselineValue = panel.min;
                            } else {
                                baselineValue = panel.max;
                            }
                            const baselineY = bb.y + bb.height - ((baselineValue - panel.min) / (panel.max - panel.min)) * bb.height;
                            const value = typeof plot.data.value === 'string' ? d[plot.data.value] : plot.data.value;
                            const y = bb.y + bb.height - ((value - panel.min) / (panel.max - panel.min)) * bb.height;
                            const rectX = x - barWidth / 2;
                            const rectY = Math.min(y, baselineY);
                            let rectHeight = Math.abs(baselineY - y);
                            if (rectHeight < 1) rectHeight = 1;
                            this.canvas.rect(Math.round(rectX), Math.round(rectY), Math.round(barWidth), rectHeight, color, true);
                            break;
                        }
                        case 'vertical-line': {
                            const index = plot.data.value;
                            const x = this.getX(index);
                            color = plot.color ? plot.color : this.colorScheme.verticalLine;
                            this.canvas.line(x, bb.y, x, bb.y + bb.height, color);
                            break;
                        }
                        case 'horizontal-line': {
                            const value = plot.data.value;
                            color = plot.color ? plot.color : this.colorScheme.horizontalLine;
                            const y = bb.y + bb.height - ((value - panel.min) / (panel.max - panel.min)) * bb.height;
                            this.canvas.line(bb.x, y, bb.x + bb.width, y, color, plot.thickness || 1);
                            break;
                        }
                        default:
                            throw new Error(`Unsupported plot type: ${plot.type}`);
                    }
                });
            });
        });
        this.rendered = true;
    }

    /**
     * Saves the current canvas as a PNG file.
     * Note: This method does not call render(); render() must be called manually
     * when you want to draw the chart before saving.
     */
    save(filename) {
        return this.canvas.save(filename);
    }
}

module.exports = NodeChart;


/*
const data = [
    {
        "timestamp": "2025-02-12T20:26:00.000Z",
        "open": 131.55,
        "high": 131.65,
        "low": 131.5401,
        "close": 131.5751,
        "volume": 321382,
        "mc": 78.25960994350808,
        "sma200": 111.57509999999999
    },
    {
        "timestamp": "2025-02-12T20:27:00.000Z",
        "open": 131.575,
        "high": 131.705,
        "low": 131.5701,
        "close": 131.67,
        "volume": 369215,
        "mc": 83.85814855729038,
        "sma200": 111.66999999999999
    },
    {
        "timestamp": "2025-02-12T20:28:00.000Z",
        "open": 131.6781,
        "high": 131.7,
        "low": 131.6,
        "close": 131.6098,
        "volume": 284749,
        "mc": 78.40413500896328,
        "sma200": 111.6098
    },
    {
        "timestamp": "2025-02-12T20:29:00.000Z",
        "open": 131.615,
        "high": 131.615,
        "low": 131.5,
        "close": 131.525,
        "volume": 282121,
        "mc": 69.63104416228518,
        "sma200": 111.525
    },
    {
        "timestamp": "2025-02-12T20:30:00.000Z",
        "open": 131.52,
        "high": 131.59,
        "low": 131.45,
        "close": 131.54,
        "volume": 285287,
        "mc": 63.51309326702367,
        "sma200": 111.53999999999999
    },
    {
        "timestamp": "2025-02-12T20:31:00.000Z",
        "open": 131.545,
        "high": 131.57,
        "low": 131.38,
        "close": 131.42,
        "volume": 290943,
        "mc": 38.078038871322846,
        "sma200": 111.41999999999999
    },
    {
        "timestamp": "2025-02-12T20:32:00.000Z",
        "open": 131.4199,
        "high": 131.42,
        "low": 131.33,
        "close": 131.3898,
        "volume": 296380,
        "mc": 23.424499681978148,
        "sma200": 111.38980000000001
    },
    {
        "timestamp": "2025-02-12T20:33:00.000Z",
        "open": 131.39,
        "high": 131.52,
        "low": 131.39,
        "close": 131.51,
        "volume": 310093,
        "mc": 32.96675258637814,
        "sma200": 111.50999999999999
    },
    {
        "timestamp": "2025-02-12T20:34:00.000Z",
        "open": 131.5001,
        "high": 131.61,
        "low": 131.4501,
        "close": 131.575,
        "volume": 249657,
        "mc": 45.62994578846222,
        "sma200": 111.57499999999999
    },
    {
        "timestamp": "2025-02-12T20:35:00.000Z",
        "open": 131.575,
        "high": 131.6,
        "low": 131.52,
        "close": 131.555,
        "volume": 221701,
        "mc": 50.32163975458063,
        "sma200": 111.555
    },
    {
        "timestamp": "2025-02-12T20:36:00.000Z",
        "open": 131.5597,
        "high": 131.59,
        "low": 131.47,
        "close": 131.485,
        "volume": 191584,
        "mc": 44.74188373772221,
        "sma200": 111.48500000000001
    }
]

const chart = new NodeChart({
    width: 800,
    height: 600,
    data: data,
    padding: 10,      // 10px padding around the edge of the canvas
    panelGap: 10,     // 10px gap between panels
    renderAxis: {
        x: false,    // Do not render the x axis
        y: true      // Render the y axis
    }
});

chart.addPanel({
    id: "stock-data",
    height: 70,
    plots: [
        {
            id: "candles",
            type: "candlesticks",
            width: 5, // candle width in px
            gap: 2,   // gap between candles (optional)
            data: {
                open: "open",
                high: "high",
                low: "low",
                close: "close"
            },
            color: {
                up: { r: 0, g: 255, b: 0, a: 255 },
                down: { r: 255, g: 0, b: 0, a: 255 }
            }
        }
    ]
});

chart.addPanel({
    id: "oscillators",
    height: 30,
    min: 0,
    max: 100,
    plots: [
        {
            id: "marketcycle",
            type: "spline",
            data: {
                value: "mc"
            },
            color: { r: 0, g: 0, b: 0, a: 255 }
        },
        {
            id: "overbought",
            type: "horizontal-line",
            data: {
                value: 70 // horizontal line at 70 on the y axis
            },
            color: { r: 255, g: 0, b: 0, a: 100 }
        },
        {
            id: "oversold",
            type: "horizontal-line",
            data: {
                value: 30 // horizontal line at 30 on the y axis
            },
            color: { r: 0, g: 255, b: 0, a: 100 }
        }
    ]
});

// Get the bounding box for the "oscillators" panel.
const oscillatorsBoundingBox = chart.getBoundingBox("oscillators");
console.log({oscillatorsBoundingBox})

// Get the {x, y} coordinates for datapoint index 5 on the "oscillators" panel, "marketcycle" plot.
const pointCoords = chart.getCoordinates(5, "stock-data", "candles");
console.log({pointCoords})

chart.render()

// Use the canvas drawing API (from NodeCanvas) to draw a circle at the computed coordinates.
chart.canvas.circle(pointCoords.x, pointCoords.y, 10, { r: 0, g: 0, b: 255, a: 255 }, true);

// Get the x position (in pixels) of the 10th datapoint.
const xLocation = chart.getX(10);
console.log({xLocation})


chart.save("chart3.png");

*/