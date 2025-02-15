const fs = require('fs').promises;

class GPT {
    constructor() {
        // Dynamically import the new OpenAI module (ES module) without changing the rest of your code.
        this.initPromise = (async () => {
            const openaiModule = await import('openai');
            // The new package auto-loads the API key from process.env.
            this.openai = new openaiModule.default();
        })();
    }

    async getPrompt(filename, data) {
        try {
            let content = await fs.readFile(filename, 'utf8');
            for (const key in data) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                content = content.replace(regex, data[key]);
            }
            return content;
        } catch (error) {
            throw new Error(`Error reading or processing file: ${error.message}`);
        }
    }

    /**
     * @param {string} system_prompt - The system prompt.
     * @param {string} user_prompt - The user prompt (a single text message).
     * @param {string[]} imageFilenames - Array of image filenames to be sent (will be read and converted to base64).
     * @param {object[]} history - Array of prior conversation messages to include between the system prompt and user prompt.
     * @param {string} model - The model to use (default "gpt-4o-mini").
     * @param {boolean} jsonOutput - If true, appends a note for JSON output.
     */
    async ask(system_prompt, user_prompt, imageFilenames = [], history = [], model = "gpt-4o-mini", jsonOutput = true) {
        await this.initPromise; // Ensure OpenAI is loaded

        // Build the text portion of the user message.
        const textMessage = {
            type: "text",
            text: user_prompt
        };

        // Process each image filename: read the file and convert it to a base64 image message.
        const imageMessages = await Promise.all(
            imageFilenames.map(async (filename) => {
                const imageBuffer = await fs.readFile(filename);
                const base64Image = imageBuffer.toString('base64');
                return {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`
                    }
                };
            })
        );

        // Build the user message content as an array: text message first, then image messages.
        const userContent = [textMessage, ...imageMessages];

        // Assemble final messages:
        // 1. The system prompt (always first)
        // 2. History messages (if any)
        // 3. The new user message (always last)
        const messages = [
            { role: "system", content: system_prompt },
            ...history,
            { role: "user", content: userContent }
        ];

        try {
            const response = await this.openai.chat.completions.create({
                model,
                messages,
                response_format: {
                    type: 'json_object'
                }
            });
            return response;
        } catch (error) {
            throw new Error(`API request failed: ${error.message}`);
        }
    }
}

module.exports = GPT;

/*
// Example usage:
const main = async () => {
    const gpt = new GPT();
    // Replace these with your actual image filenames.
    const imageFilenames = [
        "path/to/image1.jpg",
        "path/to/image2.jpg"
    ];
    // Example history (optional) — prior messages in the conversation.
    const history = [
        { role: "user", content: "That's weird..." }
    ];

    const response = await gpt.ask(
        "You answer like scoobydoo. Reply in JSON using `{answer: string}`",
        "Hey scooby, I don't want to alarm you but there's a floating ham behind you...",
        [],//imageFilenames,
        history,         // Pass history messages here
        "gpt-4o-mini",   // Model name
        false            // Set jsonOutput to false if not needed
    );
    console.log(response.choices[0]);
};

main();
*/