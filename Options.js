const axios = require('axios');

class Options {
    constructor() {
        // Theta Terminal runs on localhost at port 25510 by default.
        this.baseUrl = process.env.THETADATA_BASE_URL || 'http://127.0.0.1:25510';
    }

    /**
     * Convert a date from "YYYY-MM-DD" to "YYYYMMDD" format.
     * @param {string} dateStr - Date string in "YYYY-MM-DD" format.
     * @returns {string} - Date string in "YYYYMMDD" format.
     */
    formatDateForQuery(dateStr) {
        return dateStr.replace(/-/g, '');
    }

    /**
     * Generates an option ticker string in the format "O:NVDA250221C00139000".
     * @param {string} underlying - The underlying symbol.
     * @param {number|string} expiration - Expiration date in YYYYMMDD format.
     * @param {string} optionType - "C" for call, "P" for put.
     * @param {number} strike - Raw strike value from API (e.g., 275000).
     * @returns {string} - Option ticker string.
     */
    generateOptionTicker(underlying, expiration, optionType, strike) {
        // Convert expiration to string and take the last 6 digits (YYMMDD)
        const expStr = expiration.toString();
        const expYYMMDD = expStr.slice(2);
        // Format strike as an 8-digit string with leading zeros.
        const strikeStr = strike.toString().padStart(8, '0');
        return `O:${underlying}${expYYMMDD}${optionType}${strikeStr}`;
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

    /**
     * Get available options contracts for a given ticker and expiration date.
     * Uses ThetaData's bulk snapshot endpoint.
     * @param {string} ticker - Underlying ticker (e.g., 'AAPL').
     * @param {string} expirationDate - Expiration date in "YYYY-MM-DD" format.
     * @returns {Promise<Array>} - List of option contracts.
     */
    async getAvailableContracts(ticker, expirationDate) {
        try {
            const exp = this.formatDateForQuery(expirationDate);
            const url = `${this.baseUrl}/v2/bulk_snapshot/option/quote`;
            const params = {
                root: ticker,
                exp: exp
            };

            const response = await axios.get(url, { params });
            const contractsRaw = response.data.response || [];

            const contracts = contractsRaw.map(entry => {
                const contract = entry.contract;
                // Calculate a mid-price from the first tick if available.
                let price = null;
                if (entry.ticks && entry.ticks.length > 0) {
                    const tick = entry.ticks[0];
                    // According to the header:
                    // index 3: bid, index 7: ask
                    const bid = tick[3];
                    const ask = tick[7];
                    price = (bid + ask) / 2;
                }
                // Generate ticker in format: "O:UNDERLYINGYYMMDDOPTIONTYPESTRIKE"
                const contractTicker = this.generateOptionTicker(
                    contract.root,
                    contract.expiration,
                    contract.right,
                    contract.strike
                );
                return {
                    ticker: contractTicker,
                    underlying: contract.root,
                    expiration: contract.expiration.toString(),
                    strike: contract.strike / 1000, // human-friendly strike (e.g., 20.0)
                    optionType: contract.right,
                    price: price
                };
            });

            return contracts;
        } catch (error) {
            console.error(
                'Error fetching available contracts:',
                error.response?.data || error.message
            );
            return [];
        }
    }

    /**
     * Get bid/ask data for a given options contract.
     * Uses ThetaData's snapshot endpoint.
     * @param {string} contractTicker - Option ticker string in the format "O:NVDA250221C00139000".
     * @returns {Promise<Object>} - Contract data including bid and ask prices.
     */
    async getContractData(contractTicker) {
        try {
            const parsed = this.parseOptionTicker(contractTicker);
            if (!parsed) {
                throw new Error('Invalid contract ticker format');
            }
            const { underlying, expiration, optionType, strike } = parsed;
            // Convert expiration Date to YYYYMMDD format.
            const year = expiration.getFullYear();
            const month = (expiration.getMonth() + 1).toString().padStart(2, '0');
            const day = expiration.getDate().toString().padStart(2, '0');
            const expParam = `${year}${month}${day}`;

            // For the API, strike should be the raw value (i.e. human strike * 1000).
            const rawStrike = strike * 1000;

            const url = `${this.baseUrl}/v2/snapshot/option/quote`;
            const params = {
                root: underlying,
                exp: expParam,
                right: optionType,
                strike: rawStrike
            };

            const response = await axios.get(url, { params });
            const ticks = response.data.response;
            if (!ticks || ticks.length === 0) {
                throw new Error('No contract data found');
            }
            const tick = ticks[0];
            // Extract bid and ask from the tick data.
            const bid = tick[3];
            const ask = tick[7];

            return {
                contractTicker: contractTicker,
                underlying: underlying,
                bid: bid,
                ask: ask
            };
        } catch (error) {
            console.error(
                'Error fetching contract data:',
                error.response?.data || error.message
            );
            return null;
        }
    }
}

module.exports = Options;

/*
// Example Usage
(async () => {
    const options = new Options();

    // Fetch available contracts for AAPL expiring on 2026-01-16
    let contracts = await options.getAvailableContracts('AAPL', '2026-01-16');
    console.log('Available Contracts:', JSON.stringify(contracts, null, 4));

    // If there are any contracts, fetch data for the first one.
    if (contracts.length > 0) {
        const contractData = await options.getContractData(contracts[0].ticker);
        console.log('Contract Data:', JSON.stringify(contractData, null, 4));
    }
})();
*/
module.exports = Options;
