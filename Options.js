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
                // Generate a unique contract ticker string.
                // Format: UNDERLYING-EXPIRATION-RIGHT-STRIKE
                const contractTicker = `${contract.root}-${contract.expiration}-${contract.right}-${contract.strike}`;
                return {
                    ticker: contractTicker,
                    underlying: contract.root,
                    expiration: contract.expiration.toString(),
                    // Adjust strike by dividing by 1000 if needed; adjust the divisor based on your data.
                    strike: contract.strike / 1000,
                    right: contract.right,
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
     * @param {string} contractTicker - Contract ticker in the format "AAPL-20260116-C-275000".
     * @returns {Promise<Object>} - Contract data including bid and ask prices.
     */
    async getContractData(contractTicker) {
        try {
            // Parse the contract ticker string.
            const parts = contractTicker.split('-');
            if (parts.length !== 4) {
                throw new Error('Invalid contract ticker format');
            }
            const [underlying, expiration, right, strike] = parts;
            const url = `${this.baseUrl}/v2/snapshot/option/quote`;
            const params = {
                root: underlying,
                exp: expiration,
                right: right,
                strike: strike
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
