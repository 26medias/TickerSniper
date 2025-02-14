Below is an example of a **README.md** for your project:

---

```markdown
# TechChart

**TechChart** is a lightweight technical charting library written in JavaScript. Originally created 10 years ago, it provides a simple way to render candlestick charts (including Heikin-Ashi style), line plots, custom text overlays, and asset images. The library renders into a pixel buffer that can be exported as a PNG file or uploaded directly to Imgur.

> **Note:**  
> - The library uses solid colors only and does **not** support gradients.  
> - It includes a `chart.line()` method to render a separate line plot under (or alongside) the candlesticks. (Make sure to provide a proper dataset for the line plot.)

## Features

- **Candlestick Rendering:**  
  Draw regular candlesticks or Heikin-Ashi style candles based on your dataset.
  
- **Line Chart Rendering:**  
  Render a separate line plot (for example, to plot a technical indicator) using the `chart.render.chart.line()` method.
  
- **Asset Overlays:**  
  Import external PNG assets (logos, markers, etc.) from the assets directory and overlay them onto the chart.
  
- **Custom Text & Geometry:**  
  Built-in font support to render numbers and letters, as well as simple geometric drawing functions (lines and rectangles).
  
- **Export Options:**  
  Convert the rendered pixel buffer into a PNG file on disk or upload it directly to Imgur.

## Installation

Install the required dependencies:

```bash
npm install moment pstack underscore pngjs imgur-uploader
```

Then include the module in your project:

```js
const techChart = require('./techChart');
```

## Usage

### Basic Candlestick Chart

Below is a simple example that renders a candlestick chart from historical data:

```js
// Assume history.data() returns an array of objects with timestamp, open, high, low, close, volume
const candlesData = history.data().map(item => ({
    d: item.timestamp,
    o: item.open,
    h: item.high,
    l: item.low,
    c: item.close,
    v: item.volume,
}));

const chart = new techChart();
chart.dataset("candles", candlesData);
chart.init();
chart.render.candles.regular("candles");

chart.toPNG("render.png", filename => {
    console.log("Image saved to:", filename);
});
```

### Rendering a Separate Line Plot

You can render a separate line chart (for example, for an indicator) using a second dataset. For instance:

```js
// Example: A line plot dataset (e.g., moving average or any other indicator)
const lineData = history.data().map(item => ({
    v: item.indicatorValue, // Ensure each data point has a 'v' value
}));

chart.dataset("line", lineData);
chart.render.chart.line("line"); // Renders the line plot using the provided dataset
```

### Using Asset Overlays & Custom Text

The library also allows you to import assets (like logos or signal icons) and add custom text. For example:

```js
// To overlay an asset at a given position
chart.render.asset("logo", { x: 50, y: 100 });

// To add custom text using the built-in font:
chart.write(10, 250, "TechChart", chart.color.text);
```

## Limitations

- **Gradients:**  
  The library currently only supports solid color fills. There is no built-in support for gradients.

- **Line Plot Data:**  
  The separate line rendering function (`chart.render.chart.line()`) expects each data point in the provided dataset to include a property (typically `v`) that defines the value for mapping to the Y-coordinate.

## Contributing

If you have ideas for enhancements (such as adding gradient support) or notice any issues, feel free to open a pull request or submit an issue.

## License

This project is licensed under the MIT License.
```

---

### Summary Answers

- **Does it support rendering a separate line plot under the candlesticks?**  
  Yes – you can supply a separate dataset and use the `chart.render.chart.line()` function to render a line plot alongside the candlestick chart.

- **Does it support gradients?**  
  No – the library currently uses solid colors only and does not support gradients.

Happy charting!
