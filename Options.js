const axios = require('axios');

class Options {
    constructor() {
        this.apiKey = process.env.POLYGON_API_KEY;
        this.baseUrl = 'https://api.polygon.io/v3';
    }

    /**
     * Get available options contracts for a given ticker and expiration date.
     * @param {string} ticker - Underlying stock ticker (e.g., 'AAPL').
     * @param {string} expirationDate - Expiration date in YYYY-MM-DD format.
     * @returns {Promise<Array>} - List of option contracts.
     */
    async getAvailableContracts(ticker, expirationDate) {
        try {
            const url = `${this.baseUrl}/reference/options/contracts`;
            const params = {
                underlying_ticker: ticker,
                expiration_date: expirationDate,
                limit: 1000,
                apiKey: this.apiKey,
            };

            const response = await axios.get(url, { params });

            return response.data.results || [];
        } catch (error) {
            console.error('Error fetching available contracts:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Get bid/ask prices and greeks for a given options contract.
     * @param {string} contractTicker - The options contract ticker (e.g., 'AAPL240621C145').
     * @returns {Promise<Object>} - Contract data including bid/ask and greeks.
     */
    async getContractData(contractTicker) {
        try {
            const url = `${this.baseUrl}/snapshot/options/${contractTicker}`;
            const params = { apiKey: this.apiKey };

            const response = await axios.get(url, { params });
            const contract = response.data.results;
            
            if (!contract) {
                throw new Error('No contract data found');
            }

            return {
                contractTicker: contract.details.ticker,
                underlying: contract.details.underlying_ticker,
                bid: contract.last_quote.bid,
                ask: contract.last_quote.ask,
                greeks: contract.greeks || {},
            };
        } catch (error) {
            console.error('Error fetching contract data:', error.response?.data || error.message);
            return null;
        }
    }
}

// Example Usage
(async () => {
    const options = new Options();

    // Fetch available contracts for AAPL expiring in 2025
    let contracts = await options.getAvailableContracts('NVDA', '2025-02-13');
    const price = 138;
    /*contracts = contracts.filter(item => {
        return Math.abs((price-item.strike_price)/price) <= 0.01
    })*/
    console.log('Available Contracts:', JSON.stringify(contracts, null, 4));



    // Fetch data for a specific contract
    if (contracts.length > 0) {
        //const contractData = await options.getContractData(contracts[0].ticker);
        //console.log('Contract Data:', JSON.stringify(contractData, null, 4));
    }
})();

module.exports = Options;
