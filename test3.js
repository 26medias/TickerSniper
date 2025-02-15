const TickerData = require('./TickerData');
const MarketCycle = require('./MarketCycle');
const NodeChart = require('./NodeChart');
const MarketSR = require('./MarketSR');

const history = new TickerData({
    data_dir: "./data",
    timeframe: "1 minute",
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
    let last50 = history.data(200);
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
    return last50//.slice(last50.length-50)
}

const getMinMax = (data) => {
    let min = Infinity;
    let max = -Infinity;

    for (const { open, high, low, close } of data) {
        min = Math.min(min, open, high, low, close);
        max = Math.max(max, open, high, low, close);
    }

    return { min, max };
};

const generateChart = (data, width=800, height=600) => {
    //console.log(data)
    const chart = new NodeChart({
        width: width,
        height: height,
        data: data,
        padding: 30,      // 10px padding around the edge of the canvas
        panelGap: 10,     // 10px gap between panels
        renderAxis: {
            x: false,    // Do not render the x axis
            y: true      // Render the y axis
        }
    });


    const sr = new MarketSR(data);

    const supports = sr.supports()
    const resistances = sr.resistances()
    const minMax = getMinMax(data);



    const lines = [];

    lines.push({
        id: `max`,
        type: "horizontal-line",
        data: {
            value: minMax.max
        },
        color: { r: 255, g: 255, b: 255, a: 255 }
    })
    lines.push({
        id: `min`,
        type: "horizontal-line",
        data: {
            value: minMax.min
        },
        color: { r: 255, g: 255, b: 255, a: 255 }
    })

    supports.forEach(item => {
        const color = { r: 0, g: 0, b: 255, a: 255 };
        lines.push({
            id: `support-${item.level.toFixed(2)}`,
            type: "horizontal-line",
            data: {
                value: parseFloat(item.level.toFixed(2))
            },
            color: color
        })
    })
    resistances.forEach(item => {
        lines.push({
            id: `resistance-${item.level.toFixed(2)}`,
            type: "horizontal-line",
            data: {
                value: parseFloat(item.level.toFixed(2))
            },
            color: { r: 255, g: 0, b: 0, a: 255 }
        })
    })

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
                    up: { r: 74, g: 164, b: 154, a: 255 },
                    down: { r: 226, g: 96, b: 83, a: 255 }
                }
            },
            ...lines
        ]
    });
    
    chart.addPanel({
        id: "marketcycle",
        height: 30,
        min: 0,
        max: 100,
        plots: [
            {
                id: "100",
                type: "horizontal-line",
                data: {
                    value: 100
                },
                color: { r: 255, g: 255, b: 255, a: 100 }
            },
            {
                id: "overbought",
                type: "horizontal-line",
                data: {
                    value: 80
                },
                color: { r: 226, g: 96, b: 83, a: 255 }
            },
            {
                id: "50",
                type: "horizontal-line",
                data: {
                    value: 50
                },
                color: { r: 255, g: 255, b: 255, a: 50 }
            },
            {
                id: "oversold",
                type: "horizontal-line",
                data: {
                    value: 20
                },
                color: { r: 74, g: 164, b: 154, a: 255 }
            },
            {
                id: "0",
                type: "horizontal-line",
                data: {
                    value: 0
                },
                color: { r: 255, g: 255, b: 255, a: 100 }
            },
            {
                id: "marketcycle",
                type: "spline",
                data: {
                    value: "marketCycle"
                },
                color: { r: 255, g: 255, b: 255, a: 255 }
            },
        ]
    });
    
    chart.addPanel({
        id: "RSI",
        height: 30,
        min: 0,
        max: 100,
        plots: [
            {
                id: "100",
                type: "horizontal-line",
                data: {
                    value: 100
                },
                color: { r: 255, g: 255, b: 255, a: 100 }
            },
            {
                id: "overbought",
                type: "horizontal-line",
                data: {
                    value: 80
                },
                color: { r: 226, g: 96, b: 83, a: 255 }
            },
            {
                id: "50",
                type: "horizontal-line",
                data: {
                    value: 50
                },
                color: { r: 255, g: 255, b: 255, a: 50 }
            },
            {
                id: "oversold",
                type: "horizontal-line",
                data: {
                    value: 20
                },
                color: { r: 74, g: 164, b: 154, a: 255 }
            },
            {
                id: "0",
                type: "horizontal-line",
                data: {
                    value: 0
                },
                color: { r: 255, g: 255, b: 255, a: 100 }
            },
            {
                id: "marketcycle",
                type: "spline",
                data: {
                    value: "RSI"
                },
                color: { r: 255, g: 255, b: 255, a: 255 }
            },
        ]
    });

    const stockBox = chart.getBoundingBox('stock-data')
    const rsiBox = chart.getBoundingBox('RSI')
    const mcBox = chart.getBoundingBox('marketcycle')

    // Chart background
    chart.canvas.rect(0, 0, width, height, {r: 21, g:23, b:34, a: 255}, true);

    // Box backgrounds
    chart.canvas.rect(rsiBox.x, rsiBox.y, rsiBox.width, rsiBox.height, {r: 35, g:39, b:49, a: 255}, true);
    chart.canvas.rect(mcBox.x, mcBox.y, mcBox.width, mcBox.height, {r: 35, g:39, b:49, a: 255}, true);

    chart.render()

    const marginX = 5;
    const marginY = -3;

    // Render the panels labels
    const mcMax = chart.getCoordinates(data.length-1, "marketcycle", "100");
    chart.canvas.write(mcMax.x+marginX, mcMax.y+marginY, "100", { r: 255, g: 255, b: 255, a: 100 })

    const mcMid = chart.getCoordinates(data.length-1, "marketcycle", "50");
    chart.canvas.write(mcMid.x+marginX, mcMid.y+marginY, "50", { r: 255, g: 255, b: 255, a: 100 })

    const mcMin = chart.getCoordinates(data.length-1, "marketcycle", "0");
    chart.canvas.write(mcMin.x+marginX, mcMin.y+marginY, "0", { r: 255, g: 255, b: 255, a: 100 })

    const mcUp = chart.getCoordinates(data.length-1, "marketcycle", "overbought");
    chart.canvas.write(mcUp.x+marginX, mcUp.y+marginY, "70", { r: 226, g: 96, b: 83, a: 255 })

    const mcDn = chart.getCoordinates(data.length-1, "marketcycle", "oversold");
    chart.canvas.write(mcDn.x+marginX, mcDn.y+marginY, "30", { r: 74, g: 164, b: 154, a: 255 })

    chart.canvas.write(mcBox.x+5, mcBox.y+10, "MARKETCYCLE: "+data[data.length-1].marketCycle.toFixed(2), { r: 255, g: 255, b: 255, a: 255 }, {font: 'large'})



    const rsiMax = chart.getCoordinates(data.length-1, "RSI", "100");
    chart.canvas.write(rsiMax.x+marginX, rsiMax.y+marginY, "100", { r: 255, g: 255, b: 255, a: 100 })

    const rsiMid = chart.getCoordinates(data.length-1, "RSI", "50");
    chart.canvas.write(rsiMid.x+marginX, rsiMid.y+marginY, "50", { r: 255, g: 255, b: 255, a: 100 })

    const rsiMin = chart.getCoordinates(data.length-1, "RSI", "0");
    chart.canvas.write(rsiMin.x+marginX, rsiMin.y+marginY, "0", { r: 255, g: 255, b: 255, a: 100 })

    const rsiUp = chart.getCoordinates(data.length-1, "RSI", "overbought");
    chart.canvas.write(rsiUp.x+marginX, rsiUp.y+marginY, "70", { r: 226, g: 96, b: 83, a: 255 })

    const rsiDn = chart.getCoordinates(data.length-1, "RSI", "oversold");
    chart.canvas.write(rsiDn.x+marginX, rsiDn.y+marginY, "30", { r: 74, g: 164, b: 154, a: 255 })

    chart.canvas.write(rsiBox.x+5, rsiBox.y+10, "RSI: "+data[data.length-1].RSI.toFixed(2), { r: 255, g: 255, b: 255, a: 255 }, {font: 'large'})

    // SR labels
    supports.forEach(item => {
        const color = { r: 0, g: 0, b: 255, a: 255 };
        const name = `support-${item.level.toFixed(2)}`
        const lineCoords = chart.getCoordinates(data.length-1, "stock-data", name);
        chart.canvas.write(lineCoords.x+marginX, lineCoords.y+marginY, item.level.toFixed(2), color)
    });
    resistances.forEach(item => {
        const color = { r: 255, g: 0, b: 0, a: 255 };
        const name = `resistance-${item.level.toFixed(2)}`
        const lineCoords = chart.getCoordinates(data.length-1, "stock-data", name);
        chart.canvas.write(lineCoords.x+marginX, lineCoords.y+marginY, item.level.toFixed(2), color)
    });

    // Min/max
    const maxCoords = chart.getCoordinates(data.length-1, "stock-data", "max");
    chart.canvas.write(maxCoords.x+marginX, maxCoords.y+marginY, minMax.max.toFixed(2), { r: 255, g: 255, b: 255, a: 255 })
    const minCoords = chart.getCoordinates(data.length-1, "stock-data", "min");
    chart.canvas.write(minCoords.x+marginX, minCoords.y+marginY, minMax.min.toFixed(2), { r: 255, g: 255, b: 255, a: 255 })

    // Price
    chart.canvas.write(stockBox.x+marginX, stockBox.y-20, "Current price: "+data[data.length-1].close.toFixed(2), { r: 255, g: 255, b: 255, a: 255 }, {font: 'large'})
    
    chart.save("chart3.png");
}
const stockdata = getStockData(data)
generateChart(stockdata);