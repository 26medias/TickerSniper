const fs = require("fs");
const path = require("path");

class PaperTrading {
    constructor(dataDir, fileFormat = "json", loggingLevel = "info") {
        this.dataDir = dataDir;
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        // loggingLevel is not actively used here; using console for logging.
        this.loggingLevel = loggingLevel;

        // Define file paths for persistence
        this.settingsFile = path.join(this.dataDir, "settings.json");
        this.accountTransactionsFile = path.join(this.dataDir, "account_transactions.json");
        this.positionLedgerFile = path.join(this.dataDir, "position_ledger.json");
        this.positionsFile = path.join(this.dataDir, "positions.json");
        this.optionPositionsFile = path.join(this.dataDir, "option_positions.json");
        this.openLimitOrdersFile = path.join(this.dataDir, "open_limit_orders.json");

        // Account funds and transactions
        this.cashBalance = 0.0;
        this.accountTransactions = [];

        // Ledger for executed orders, limit orders, cancellations, etc.
        this.positionLedger = [];

        // Stock Positions: mapping symbol -> { qty, average_cost, current_price }
        this.positions = {};

        // Options Positions: mapping contract_ticker -> { qty, average_cost, current_price, underlying, expiration, optionType, strike, multiplier }
        this.optionPositions = {};

        // Open limit orders (both buy and sell) waiting to be filled.
        // Orders may include an optional contract_ticker property.
        this.openLimitOrders = [];

        // Unique order id counter
        this.nextOrderId = 1;

        // Load previously saved state, if available.
        this._loadState();
    }

    // ----------------------
    // Persistence Methods
    // ----------------------
    _saveState() {
        const settings = {
            cash_balance: this.cashBalance,
            next_order_id: this.nextOrderId
        };
        fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 4));
        fs.writeFileSync(this.accountTransactionsFile, JSON.stringify(this.accountTransactions, null, 4));
        fs.writeFileSync(this.positionLedgerFile, JSON.stringify(this.positionLedger, null, 4));
        fs.writeFileSync(this.positionsFile, JSON.stringify(this.positions, null, 4));
        fs.writeFileSync(this.optionPositionsFile, JSON.stringify(this.optionPositions, null, 4));
        fs.writeFileSync(this.openLimitOrdersFile, JSON.stringify(this.openLimitOrders, null, 4));
    }

    _loadState() {
        if (fs.existsSync(this.settingsFile)) {
            try {
                const settings = JSON.parse(fs.readFileSync(this.settingsFile, "utf8"));
                this.cashBalance = settings.cash_balance || 0.0;
                this.nextOrderId = settings.next_order_id || 1;
            } catch (err) {
                console.warn("Error loading settings:", err);
            }
        }
        if (fs.existsSync(this.accountTransactionsFile)) {
            try {
                this.accountTransactions = JSON.parse(fs.readFileSync(this.accountTransactionsFile, "utf8"));
            } catch (err) {
                console.warn("Error loading account transactions:", err);
            }
        }
        if (fs.existsSync(this.positionLedgerFile)) {
            try {
                this.positionLedger = JSON.parse(fs.readFileSync(this.positionLedgerFile, "utf8"));
            } catch (err) {
                console.warn("Error loading position ledger:", err);
            }
        }
        if (fs.existsSync(this.positionsFile)) {
            try {
                this.positions = JSON.parse(fs.readFileSync(this.positionsFile, "utf8"));
            } catch (err) {
                console.warn("Error loading positions:", err);
            }
        }
        if (fs.existsSync(this.optionPositionsFile)) {
            try {
                this.optionPositions = JSON.parse(fs.readFileSync(this.optionPositionsFile, "utf8"));
            } catch (err) {
                console.warn("Error loading option positions:", err);
            }
        }
        if (fs.existsSync(this.openLimitOrdersFile)) {
            try {
                this.openLimitOrders = JSON.parse(fs.readFileSync(this.openLimitOrdersFile, "utf8"));
            } catch (err) {
                console.warn("Error loading open limit orders:", err);
            }
        }
    }

    // ----------------------
    // 1. Account Methods
    // ----------------------
    credit(amount, note = "") {
        this.cashBalance += amount;
        const transaction = {
            timestamp: new Date().toISOString(),
            type: "credit",
            amount: amount,
            note: note
        };
        this.accountTransactions.push(transaction);
        console.info(`Credited ${amount}. New balance: ${this.cashBalance}.`);
        this._saveState();
        return true;
    }

    debit(amount, note = "") {
        if (this.cashBalance < amount) {
            console.warn("Insufficient funds for debit.");
            return false;
        }
        this.cashBalance -= amount;
        const transaction = {
            timestamp: new Date().toISOString(),
            type: "debit",
            amount: amount,
            note: note
        };
        this.accountTransactions.push(transaction);
        console.info(`Debited ${amount}. New balance: ${this.cashBalance}.`);
        this._saveState();
        return true;
    }

    // ----------------------
    // 2. Trading Methods
    // ----------------------
    buy(symbol, dt, price, qty, note = "", limit = null, tif = "GTC", contract_ticker = null) {
        if (limit !== null) {
            // Limit order – works for both stocks and options.
            const order = {
                order_id: this.nextOrderId,
                symbol,
                qty,
                limit,
                order_type: "limit_buy",
                tif,
                datetime: dt.toISOString(),
                note,
                contract_ticker
            };
            this.nextOrderId += 1;
            this.openLimitOrders.push(order);
            this.positionLedger.push({ ...order, type: "limit_buy_order" });
            console.info("Created limit buy order:", order);
            this._saveState();
            return true;
        } else {
            // Immediate execution.
            const cost = price * qty;
            if (contract_ticker) {
                // Option trade
                if (this.cashBalance < cost) {
                    console.warn("Insufficient funds for immediate option buy.");
                    return false;
                }
                if (!this.debit(cost, `Option Buy ${qty} of ${contract_ticker} at ${price}`)) {
                    return false;
                }
                this._updateOptionPosition(contract_ticker, qty, price);
                const trade = {
                    order_id: this.nextOrderId,
                    symbol,
                    qty,
                    price,
                    type: "option_buy",
                    datetime: dt.toISOString(),
                    note,
                    contract_ticker
                };
                this.nextOrderId += 1;
                this.positionLedger.push(trade);
                console.info("Executed immediate option buy:", trade);
            } else {
                // Stock trade
                if (this.cashBalance < cost) {
                    console.warn("Insufficient funds for immediate buy.");
                    return false;
                }
                if (!this.debit(cost, `Buy ${qty} of ${symbol} at ${price}`)) {
                    return false;
                }
                this._updatePosition(symbol, qty, price);
                const trade = {
                    order_id: this.nextOrderId,
                    symbol,
                    qty,
                    price,
                    type: "buy",
                    datetime: dt.toISOString(),
                    note
                };
                this.nextOrderId += 1;
                this.positionLedger.push(trade);
                console.info("Executed immediate buy:", trade);
            }
            this._saveState();
            return true;
        }
    }

    close(symbol, dt, price, qty, note = "", limit = null, tif = "GTC", contract_ticker = null) {
        if (contract_ticker) {
            // Option trade close.
            if (!this.optionPositions[contract_ticker] || parseInt(this.optionPositions[contract_ticker].qty) < qty) {
                console.warn("Not enough option contracts to close.");
                return false;
            }
            if (limit !== null) {
                const order = {
                    order_id: this.nextOrderId,
                    symbol,
                    qty,
                    limit,
                    order_type: "limit_sell",
                    tif,
                    datetime: dt.toISOString(),
                    note,
                    contract_ticker
                };
                this.nextOrderId += 1;
                this.openLimitOrders.push(order);
                this.positionLedger.push({ ...order, type: "limit_sell_order" });
                console.info("Created limit option sell order:", order);
                this._saveState();
                return true;
            } else {
                // Immediate option sell.
                // Remove from optionPositions
                this._closeOptionPosition(contract_ticker, qty);
                const proceeds = price * qty;
                this.credit(proceeds, `Option Close ${qty} of ${contract_ticker} at ${price}`);
                const trade = {
                    order_id: this.nextOrderId,
                    symbol,
                    qty,
                    price,
                    type: "option_sell",
                    datetime: dt.toISOString(),
                    note,
                    contract_ticker
                };
                this.nextOrderId += 1;
                this.positionLedger.push(trade);
                console.info("Executed immediate option sell:", trade);
                this._saveState();
                return true;
            }
        } else {
            // Stock trade close.
            if (!this.positions[symbol] || parseInt(this.positions[symbol].qty) < qty) {
                console.warn("Not enough shares to close.");
                return false;
            }
            if (limit !== null) {
                const order = {
                    order_id: this.nextOrderId,
                    symbol,
                    qty,
                    limit,
                    order_type: "limit_sell",
                    tif,
                    datetime: dt.toISOString(),
                    note
                };
                this.nextOrderId += 1;
                this.openLimitOrders.push(order);
                this.positionLedger.push({ ...order, type: "limit_sell_order" });
                console.info("Created limit sell order:", order);
                this._saveState();
                return true;
            } else {
                // Immediate stock sell.
                this.positions[symbol].qty = parseInt(this.positions[symbol].qty) - qty;
                const proceeds = price * qty;
                this.credit(proceeds, `Close ${qty} of ${symbol} at ${price}`);
                const trade = {
                    order_id: this.nextOrderId,
                    symbol,
                    qty,
                    price,
                    type: "sell",
                    datetime: dt.toISOString(),
                    note
                };
                this.nextOrderId += 1;
                this.positionLedger.push(trade);
                console.info("Executed immediate close:", trade);
                this._saveState();
                return true;
            }
        }
    }

    cancel(symbol, limitPrice, qty, note = "") {
        let orderToCancel = null;
        for (const order of this.openLimitOrders) {
            if (order.symbol === symbol && order.limit === limitPrice && order.qty === qty) {
                orderToCancel = order;
                break;
            }
        }
        if (orderToCancel) {
            this.openLimitOrders = this.openLimitOrders.filter(o => o !== orderToCancel);
            const cancellation = {
                order_id: orderToCancel.order_id,
                symbol,
                qty,
                price: limitPrice,
                type: "cancel",
                datetime: new Date().toISOString(),
                note
            };
            this.positionLedger.push(cancellation);
            console.info("Cancelled order:", cancellation);
            this._saveState();
            return true;
        } else {
            console.warn("Order to cancel not found.");
            return false;
        }
    }

    cancelAll(symbol, note = "") {
        const ordersToCancel = this.openLimitOrders.filter(order => order.symbol === symbol);
        if (ordersToCancel.length === 0) {
            console.info("No open limit orders found for symbol to cancel.");
            return false;
        }
        for (const order of ordersToCancel) {
            this.openLimitOrders = this.openLimitOrders.filter(o => o !== order);
            const cancellation = {
                order_id: order.order_id,
                symbol,
                qty: order.qty,
                price: order.limit,
                type: "cancel",
                datetime: new Date().toISOString(),
                note: note + " - cancelAll"
            };
            this.positionLedger.push(cancellation);
            console.info("Cancelled order:", cancellation);
        }
        this._saveState();
        return true;
    }

    // ----------------------
    // 3. Getter Methods
    // ----------------------
    getAccountBalance() {
        return this.cashBalance;
    }

    getAccountTransactions() {
        return this.accountTransactions;
    }

    getPortfolioValue() {
        let totalValue = 0.0;
        // Sum stock positions
        for (const symbol in this.positions) {
            const pos = this.positions[symbol];
            const price = pos.current_price !== undefined ? pos.current_price : pos.average_cost || 0;
            totalValue += parseInt(pos.qty) * parseFloat(price);
        }
        // Sum option positions (if a market price is available, otherwise use average_cost)
        for (const ticker in this.optionPositions) {
            const pos = this.optionPositions[ticker];
            const price = pos.current_price !== undefined ? pos.current_price : pos.average_cost || 0;
            totalValue += parseInt(pos.qty) * parseFloat(price);
        }
        return totalValue;
    }

    getAccountValue() {
        return this.cashBalance + this.getPortfolioValue();
    }

    getAccountPNL() {
        const totalCredits = this.accountTransactions
            .filter(tx => tx.type === "credit")
            .reduce((sum, tx) => sum + tx.amount, 0);
        const totalDebits = this.accountTransactions
            .filter(tx => tx.type === "debit")
            .reduce((sum, tx) => sum + tx.amount, 0);
        const netInvestment = totalCredits - totalDebits;
        const accountValue = this.getAccountValue();
        const pnlValue = accountValue - netInvestment;
        const pnlPercent = netInvestment !== 0 ? (pnlValue / netInvestment * 100) : 0.0;
        return { value: pnlValue, percent: pnlPercent };
    }

    getSymbols(target = "all") {
        const symbolsSet = new Set();
        if (target === "all") {
            for (const entry of this.positionLedger) {
                symbolsSet.add(entry.symbol);
            }
        } else if (target === "open") {
            for (const symbol in this.positions) {
                const pos = this.positions[symbol];
                if (parseInt(pos.qty) > 0) {
                    symbolsSet.add(symbol);
                }
            }
        } else if (target === "closed") {
            for (const symbol in this.positions) {
                const pos = this.positions[symbol];
                if (parseInt(pos.qty) === 0) {
                    symbolsSet.add(symbol);
                }
            }
        } else if (target === "limit") {
            for (const order of this.openLimitOrders) {
                symbolsSet.add(order.symbol);
            }
        }
        return Array.from(symbolsSet);
    }

    getPortfolio(asDict = true) {
        const portfolio = [];
        // Stock positions
        for (const symbol in this.positions) {
            const pos = this.positions[symbol];
            const qty = parseInt(pos.qty) || 0;
            if (qty !== 0) {
                const currentPrice = pos.current_price !== undefined
                    ? parseFloat(pos.current_price)
                    : parseFloat(pos.average_cost || 0);
                const averageCost = parseFloat(pos.average_cost || 0);
                const marketValue = qty * currentPrice;
                const costBasis = qty * averageCost;
                const unrealizedPL = marketValue - costBasis;
                const unrealizedPLPercent = costBasis !== 0 ? (unrealizedPL / costBasis * 100) : 0.0;
                portfolio.push({
                    symbol,
                    quantity: qty,
                    average_cost: averageCost,
                    current_price: currentPrice,
                    market_value: marketValue,
                    unrealized_pl: unrealizedPL,
                    unrealized_pl_percent: unrealizedPLPercent,
                    type: "stock"
                });
            }
        }
        // Option positions
        for (const ticker in this.optionPositions) {
            const pos = this.optionPositions[ticker];
            const qty = parseInt(pos.qty) || 0;
            if (qty !== 0) {
                const currentPrice = pos.current_price !== undefined
                    ? parseFloat(pos.current_price)
                    : parseFloat(pos.average_cost || 0);
                const averageCost = parseFloat(pos.average_cost || 0);
                const marketValue = qty * currentPrice;
                const costBasis = qty * averageCost;
                const unrealizedPL = marketValue - costBasis;
                const unrealizedPLPercent = costBasis !== 0 ? (unrealizedPL / costBasis * 100) : 0.0;
                portfolio.push({
                    contract_ticker: ticker,
                    underlying: pos.underlying,
                    quantity: qty,
                    average_cost: averageCost,
                    current_price: currentPrice,
                    market_value: marketValue,
                    unrealized_pl: unrealizedPL,
                    unrealized_pl_percent: unrealizedPLPercent,
                    expiration: pos.expiration,
                    option_type: pos.optionType,
                    strike: pos.strike,
                    multiplier: pos.multiplier,
                    type: "option"
                });
            }
        }
        return portfolio;
    }

    getOpenLimitOrders() {
        // Return a shallow copy
        return [...this.openLimitOrders];
    }

    // ----------------------
    // 4. Tick Method
    // ----------------------
    tick(dataArray, currentDt) {
        // Assume market close at 16:00 local time.
        const marketCloseTime = new Date(currentDt);
        marketCloseTime.setHours(16, 0, 0, 0);

        const ordersToRemove = [];

        // Helper to get market price for a given symbol.
        const getMarketPrice = (symbol) => {
            if (Array.isArray(dataArray)) {
                // Expect each object to have a 'symbol' property.
                const dataObj = dataArray.find(item => item.symbol === symbol);
                if (dataObj && dataObj.close !== undefined) {
                    return dataObj.close;
                } else {
                    console.warn(`Market price for ${symbol} not found in tick data.`);
                    return undefined;
                }
            } else if (typeof dataArray === "object") {
                return dataArray[symbol];
            }
            return undefined;
        };

        // Process open limit orders (works for both stocks and options)
        for (const order of [...this.openLimitOrders]) {
            const symbol = order.symbol;
            const marketPrice = getMarketPrice(symbol);
            if (marketPrice === undefined) continue;

            let executed = false;

            if (order.order_type === "limit_buy") {
                if (marketPrice <= order.limit) {
                    const cost = order.qty * order.limit;
                    if (order.contract_ticker) {
                        // Option limit buy
                        if (this.cashBalance >= cost) {
                            this.debit(cost, `Limit Option Buy executed for order ${order.order_id}`);
                            this._updateOptionPosition(order.contract_ticker, order.qty, order.limit);
                            const execution = {
                                order_id: order.order_id,
                                symbol: symbol,
                                qty: order.qty,
                                price: order.limit,
                                type: "limit_option_buy_executed",
                                datetime: currentDt.toISOString(),
                                note: order.note || "",
                                contract_ticker: order.contract_ticker
                            };
                            this.positionLedger.push(execution);
                            console.info("Executed limit option buy:", execution);
                            executed = true;
                        } else {
                            console.warn(`Insufficient funds to execute limit option buy order ${order.order_id}.`);
                        }
                    } else {
                        // Stock limit buy
                        if (this.cashBalance >= cost) {
                            this.debit(cost, `Limit Buy executed for order ${order.order_id}`);
                            this._updatePosition(symbol, order.qty, order.limit);
                            const execution = {
                                order_id: order.order_id,
                                symbol: symbol,
                                qty: order.qty,
                                price: order.limit,
                                type: "limit_buy_executed",
                                datetime: currentDt.toISOString(),
                                note: order.note || ""
                            };
                            this.positionLedger.push(execution);
                            console.info("Executed limit buy:", execution);
                            executed = true;
                        } else {
                            console.warn(`Insufficient funds to execute limit buy order ${order.order_id}.`);
                        }
                    }
                }
            } else if (order.order_type === "limit_sell") {
                if (marketPrice >= order.limit) {
                    if (order.contract_ticker) {
                        // Option limit sell
                        if (this.optionPositions[order.contract_ticker] && parseInt(this.optionPositions[order.contract_ticker].qty) >= order.qty) {
                            this._closeOptionPosition(order.contract_ticker, order.qty);
                            const proceeds = order.qty * order.limit;
                            this.credit(proceeds, `Limit Option Sell executed for order ${order.order_id}`);
                            const execution = {
                                order_id: order.order_id,
                                symbol: symbol,
                                qty: order.qty,
                                price: order.limit,
                                type: "limit_option_sell_executed",
                                datetime: currentDt.toISOString(),
                                note: order.note || "",
                                contract_ticker: order.contract_ticker
                            };
                            this.positionLedger.push(execution);
                            console.info("Executed limit option sell:", execution);
                            executed = true;
                        } else {
                            console.warn(`Not enough option contracts to execute limit sell order ${order.order_id}.`);
                        }
                    } else {
                        // Stock limit sell
                        if (this.positions[symbol] && parseInt(this.positions[symbol].qty) >= order.qty) {
                            this.positions[symbol].qty = parseInt(this.positions[symbol].qty) - order.qty;
                            const proceeds = order.qty * order.limit;
                            this.credit(proceeds, `Limit Sell executed for order ${order.order_id}`);
                            const execution = {
                                order_id: order.order_id,
                                symbol: symbol,
                                qty: order.qty,
                                price: order.limit,
                                type: "limit_sell_executed",
                                datetime: currentDt.toISOString(),
                                note: order.note || ""
                            };
                            this.positionLedger.push(execution);
                            console.info("Executed limit sell:", execution);
                            executed = true;
                        } else {
                            console.warn(`Not enough shares to execute limit sell order ${order.order_id}.`);
                        }
                    }
                }
            }

            // Auto-cancel DAY orders if market has closed and order is not executed.
            if (order.tif === "DAY" && currentDt >= marketCloseTime && !executed) {
                const cancellation = {
                    order_id: order.order_id,
                    symbol: symbol,
                    qty: order.qty,
                    price: order.limit,
                    type: "limit_order_cancelled",
                    datetime: currentDt.toISOString(),
                    note: "DAY order auto-cancelled at market close"
                };
                this.positionLedger.push(cancellation);
                console.info("Auto-cancelled DAY order:", cancellation);
                ordersToRemove.push(order);
            }
            if (executed) {
                ordersToRemove.push(order);
            }
        }

        // Remove executed or cancelled orders.
        for (const order of ordersToRemove) {
            this.openLimitOrders = this.openLimitOrders.filter(o => o.order_id !== order.order_id);
        }

        // Update current market prices for stock positions.
        for (const symbol in this.positions) {
            const pos = this.positions[symbol];
            const price = getMarketPrice(symbol) !== undefined
                ? getMarketPrice(symbol)
                : (pos.current_price !== undefined ? pos.current_price : pos.average_cost || 0);
            pos.current_price = price;
        }

        // Process options expirations & assignment.
        // For each held option, if expired, exercise (if ITM) or expire worthless.
        for (const ticker in this.optionPositions) {
            const option = this.optionPositions[ticker];
            // Parse the option ticker to get expiration, underlying, etc.
            const parsed = this.parseOptionTicker(ticker);
            if (!parsed) continue;
            const expDate = parsed.expiration;
            if (currentDt >= expDate) {
                // Get market price for underlying.
                const underlyingPrice = getMarketPrice(parsed.underlying);
                if (parsed.optionType === "C") {
                    if (underlyingPrice !== undefined && underlyingPrice > parsed.strike) {
                        // In-the-money call: exercise.
                        const multiplier = parsed.multiplier;
                        const totalShares = option.qty * multiplier;
                        const requiredCash = parsed.strike * totalShares;
                        if (this.cashBalance >= requiredCash) {
                            this.debit(requiredCash, `Exercised option ${ticker} for assignment`);
                            // Add shares to stock positions.
                            this._updatePosition(parsed.underlying, totalShares, parsed.strike);
                            const assignment = {
                                order_id: this.nextOrderId,
                                symbol: parsed.underlying,
                                qty: totalShares,
                                price: parsed.strike,
                                type: "option_assignment",
                                datetime: currentDt.toISOString(),
                                note: `Exercised ${ticker} into ${totalShares} shares`
                            };
                            this.nextOrderId += 1;
                            this.positionLedger.push(assignment);
                            console.info("Exercised option (assignment):", assignment);
                        } else {
                            console.warn(`Not enough cash to exercise option ${ticker}.`);
                        }
                    } else {
                        // Option expires worthless.
                        const expirationEntry = {
                            order_id: this.nextOrderId,
                            contract_ticker: ticker,
                            type: "option_expired",
                            datetime: currentDt.toISOString(),
                            note: `Option ${ticker} expired worthless`
                        };
                        this.nextOrderId += 1;
                        this.positionLedger.push(expirationEntry);
                        console.info("Option expired worthless:", expirationEntry);
                    }
                }
                // For puts or other option types, additional logic could be added.
                // Remove the option position (whether exercised or expired).
                delete this.optionPositions[ticker];
            }
        }

        this._saveState();
    }

    // ----------------------
    // Helper Methods
    // ----------------------
    _updatePosition(symbol, qty, price) {
        if (this.positions[symbol]) {
            const pos = this.positions[symbol];
            const currentQty = parseInt(pos.qty) || 0;
            const newQty = currentQty + qty;
            const totalCost = (parseFloat(pos.average_cost) || 0) * currentQty + price * qty;
            const newAvg = newQty !== 0 ? totalCost / newQty : 0.0;
            pos.qty = newQty;
            pos.average_cost = newAvg;
            pos.current_price = price;
        } else {
            this.positions[symbol] = {
                qty: qty,
                average_cost: price,
                current_price: price
            };
        }
    }

    _updateOptionPosition(contract_ticker, qty, price) {
        // Parse the option ticker to extract details.
        const parsed = this.parseOptionTicker(contract_ticker);
        if (!parsed) {
            console.warn(`Unable to parse option ticker: ${contract_ticker}`);
            return;
        }
        if (this.optionPositions[contract_ticker]) {
            const pos = this.optionPositions[contract_ticker];
            const currentQty = parseInt(pos.qty) || 0;
            const newQty = currentQty + qty;
            const totalCost = (parseFloat(pos.average_cost) || 0) * currentQty + price * qty;
            const newAvg = newQty !== 0 ? totalCost / newQty : 0.0;
            pos.qty = newQty;
            pos.average_cost = newAvg;
            pos.current_price = price;
        } else {
            this.optionPositions[contract_ticker] = {
                qty: qty,
                average_cost: price,
                current_price: price,
                underlying: parsed.underlying,
                expiration: parsed.expiration,
                optionType: parsed.optionType,
                strike: parsed.strike,
                multiplier: parsed.multiplier
            };
        }
    }

    _closeOptionPosition(contract_ticker, qty) {
        if (!this.optionPositions[contract_ticker]) return;
        const pos = this.optionPositions[contract_ticker];
        const currentQty = parseInt(pos.qty) || 0;
        if (currentQty < qty) {
            console.warn("Attempting to close more option contracts than held.");
            return;
        }
        pos.qty = currentQty - qty;
        if (pos.qty === 0) {
            delete this.optionPositions[contract_ticker];
        }
    }

    /**
     * Parses an option ticker string of the form "O:NVDA250221C00139000"
     * into an object with underlying, expiration (Date), optionType ("C" or "P"), strike (number), multiplier.
     * This implementation assumes:
     *  - The ticker starts with "O:"
     *  - The underlying symbol is the letters following "O:" until the first digit.
     *  - The next 6 digits are the expiration date in YYMMDD (assumed 20YY).
     *  - The following character is the option type ("C" for call, "P" for put).
     *  - The remaining digits represent the strike price with an implied decimal (divide by 1000).
     */
    parseOptionTicker(ticker) {
        try {
            if (!ticker.startsWith("O:")) return null;
            const body = ticker.slice(2);
            // Find the first digit index.
            let idx = 0;
            while (idx < body.length && isNaN(parseInt(body[idx], 10))) {
                idx++;
            }
            const underlying = body.slice(0, idx);
            // Next 6 characters for expiration date (YYMMDD)
            const expStr = body.slice(idx, idx + 6);
            idx += 6;
            // Create a Date object. (Assuming 20YY)
            const year = parseInt(expStr.slice(0, 2), 10) + 2000;
            const month = parseInt(expStr.slice(2, 4), 10) - 1;
            const day = parseInt(expStr.slice(4, 6), 10);
            const expiration = new Date(year, month, day);
            // Next character is option type.
            const optionType = body[idx];
            idx += 1;
            // The remaining digits are strike price.
            const strikeStr = body.slice(idx);
            const strike = parseInt(strikeStr, 10) / 1000; // implied 3 decimals.
            // Assume multiplier is 100.
            const multiplier = 100;
            return { underlying, expiration, optionType, strike, multiplier };
        } catch (error) {
            console.warn("Error parsing option ticker:", error);
            return null;
        }
    }
}

module.exports = PaperTrading;

// ----------------------
// Example of Use
// ----------------------
if (require.main === module) {
    const pt = new PaperTrading("./data", "json", "debug");

    // Credit the account with $10,000.
    pt.credit(10000, "Initial deposit");

    // Stock: Execute an immediate buy: 10 shares of AAPL at $150 each.
    pt.buy("AAPL", new Date(), 150, 10, "Buy AAPL immediate");

    // Option: Place an immediate buy for a call option.
    // For example, contract_ticker "O:NVDA250221C00139000" represents a NVDA call expiring on 2025-02-21 with strike 139.0.
    pt.buy("NVDA", new Date(), 5.0, 2, "Buy NVDA call option", null, "GTC", "O:NVDA250221C00139000");

    // Option: Place a limit buy order for an option.
    pt.buy("NVDA", new Date(), 5.5, 1, "Limit buy NVDA call option", 5.5, "DAY", "O:NVDA250221C00139000");

    // Stock: Execute an immediate sell (close) of 5 shares of AAPL at $155 each.
    pt.close("AAPL", new Date(), 155, 5, "Sell some AAPL immediate");

    // Option: Execute an immediate sell (close) of 1 option contract.
    pt.close("NVDA", new Date(), 6.0, 1, "Sell NVDA call option", null, "GTC", "O:NVDA250221C00139000");

    // Simulate a market tick update.
    // Data array should include objects with a 'symbol' property.
    const tickData = [
        {
            symbol: "NVDA",
            timestamp: "2025-02-12T20:11:00.000Z",
            open: 135,
            high: 137,
            low: 134,
            close: 140,
            volume: 161107
        },
        {
            symbol: "AAPL",
            timestamp: "2025-02-12T20:12:00.000Z",
            open: 154,
            high: 156,
            low: 153,
            close: 156,
            volume: 418031
        }
    ];
    pt.tick(tickData, new Date());

    console.log("Account Balance:", pt.getAccountBalance());
    console.log("Portfolio:", pt.getPortfolio());
    console.log("Open Limit Orders:", pt.getOpenLimitOrders());
    console.log("Account PNL:", pt.getAccountPNL());
}
