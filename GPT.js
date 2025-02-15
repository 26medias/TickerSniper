const fs = require('fs').promises;
const axios = require('axios');

class GPT {
    constructor() {}

    async getPrompt(filename, data) {
        try {
            let content = await fs.readFile(filename, 'utf8');
            for (let key in data) {
                // Create a global regex to replace all occurrences of the placeholder
                const regex = new RegExp(`{{${key}}}`, 'g');
                content = content.replace(regex, data[key]);
            }
            return content;
        } catch (error) {
            throw new Error(`Error reading or processing file: ${error.message}`);
        }
    }

    async ask(system_prompt, user_prompt, images = [], model = "o1-mini", jsonOutput = true) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OpenAI API key not found in environment variables.");
        }

        // Optionally append a note to have JSON output from the model
        const modifiedUserPrompt = jsonOutput 
            ? `${user_prompt}\n\nPlease provide the answer in JSON format.` 
            : user_prompt;

        const payload = {
            model,
            messages: [
                { role: "system", content: system_prompt },
                { role: "user", content: modifiedUserPrompt }
            ],
            // Including images as a custom parameter, adjust as per your API’s requirements.
            images
        };

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };

        const endpoint = 'https://api.openai.com/v1/chat/completions';

        try {
            const response = await axios.post(endpoint, payload, { headers });
            return response.data;
        } catch (error) {
            throw new Error(`API request failed: ${error.message}`);
        }
    }
}

module.exports = GPT;
