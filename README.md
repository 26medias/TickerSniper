# TickerSniper

Monitors a symbol for day-trading opportunities


## General idea

- Monitor prices of a ticker
- Generate charts
- Get Reddit
- Get news
    - Summarize news? Dates important
- Get portfolio
    - Track portfolio options values
- Ask GPT
- Execute actions

## Need

- 1 minute
- 1 day


## Logic

- Monitor the data on relevant timeframes
- onDataUpdate:
    - Generate chart
    - ...

# Report needs:
- Chart
- Close prices
    - Latest values
    - Last 10 days
    - Last few minutes, at interval
- MarketCycles (Similar to RSI, range [0;100], indicate overbought/oversold)
    - Latest values
    - Last 10 days
    - Last few minutes, at interval
- News
- Reddit stats
- Open position
    - unit cost
    - unit value
    - qty
    - profit/loss (%)
- Available option contracts to purchase


## Prompt maker

I will be using an LLM agent to assist me in day trading.

I will provide to the agent:
- Chart images (candlesticks, volume & historical RSI, 60 datapoints)
- Close prices
    - Latest value
    - Last 10 days
    - Last few minutes, at interval
- Volume
    - Last 10 days
    - Last few minutes, at interval
- RSI
    - Latest value
    - Last 10 days
    - Last few minutes, at interval
- MACD
    - Latest value
    - Last 10 days
    - Last few minutes, at interval
- Latest news for that ticker
- Reddit stats for that ticker (mentions, upvotes, change in mentions since 24h ago, ...)
- Cash available to trade
- Open call/put positions in the portfolio (if any):
    - contract ticker (example: O:NVDA211119C00085000)
    - unit cost (when purchased)
    - unit value (current value)
    - qty
    - current profit/loss (%)
    - Time to expiration (in seconds)
- Available option contracts to purchase

The agent will need to return:
- Actions to perform (array of actions, can be empty):
    - No actions
    - Buy an option contract (call or put)
    - Sell an open position
- Reason for the actions performed


The positions will be executed on a paper trading account for a few months during testing.


Do you have any comments or suggestions to increase the probabilities of success?
Any other data it would need? Anything else?





Some of that data I don't have because it's either not available or too expensive to access.
Here is the new list of what I will provide:

I will provide to the agent:
- Chart images (candlesticks, volume & historical RSI, 60 datapoints)
- Close prices
    - Latest value
    - Last 10 days
    - Last few minutes, at interval
- Volume
    - Last 10 days
    - Last few minutes, at interval
- RSI
    - Latest value
    - Last 10 days
    - Last few minutes, at interval
- MACD
    - Latest value
    - Last 10 days
    - Last few minutes, at interval
- Latest news for that ticker
- Reddit stats for that ticker (mentions, upvotes, change in mentions since 24h ago, ...)
- Cash available to trade
- Open call/put positions in the portfolio (if any):
    - contract ticker (example: O:NVDA211119C00085000)
    - unit cost (when purchased)
    - unit value (current value)
    - qty
    - current profit/loss (%)
    - Time to expiration (in seconds)
- Available option contracts to purchase


The agent will need to return:
- Actions to perform (array of actions, can be empty):
    - No actions
    - Buy an option contract (call or put)
    - Sell an open position
- Reason for the actions performed


Example with 2 actions:
- Place a limit order to buy 5 contracts `O:NVDA211119C00085000` at $45.65 with a time-in-force "GTC" (remains open until canceled or filled.)
- Sell 1 contract it owns, "O:NVDA211116C00084000", at market value
```
{
    "actions": [
        {
            "actions": "buy",
            "contract": "O:NVDA211119C00085000",
            "qty": 5, // Number of contracts. Each contract holds 100 shares
            "limitOrder": true, // true if it's a limit order
            "limitPrice": 45.65, // Limit price
            "tif": "GTC", // `"DAY"` auto-cancel at the end of the trading day, `"GTC"` remains open until canceled or filled.
            "reason": "Currently oversold on the 1 minute timeframe and almost touching a support at $45.65, high probability of bouncing back up."
        },
        {
            "actions": "sell",
            "contract": "O:NVDA211116C00084000",
            "qty": 2,
            "reason": "The price is about to touch a support, with an expected bounce. The daily RSI is rising, & the stock is up 6% today. It seems prudent to close this position and pocket the 278% gains."
        }
    ]
}
```

Example without actions:
```
{
    "actions": []
}
```


Write the prompts for the LLM agent.
The system prompt will contain the instructions without data: what to do, what to return and how.
The user prompt will contain the data. It should contain placeholders with variable names I will replace with the actual data.