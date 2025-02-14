const axios = require('axios');
const fs = require('fs');

async function fetchChart() {
    const chartConfig = {
        type: "candlestick",
        data: {
            datasets: [{
                label: "Stock Price",
                data: [
                    { t: 1700000000000, o: 100, h: 110, l: 95, c: 105 },
                    { t: 1700003600000, o: 106, h: 115, l: 102, c: 110 },
                    { t: 1700007200000, o: 109, h: 120, l: 108, c: 118 },
                    { t: 1700010800000, o: 117, h: 122, l: 113, c: 120 }
                ]
            }]
        }
    };

    const url = `https://quickchart.io/chart?width=800&height=600&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync('candlestick_chart.png', response.data);
    console.log("Chart saved as 'candlestick_chart.png'");
}

fetchChart();
