const { Configuration, OpenAIApi } = require('openai');

// Validate OpenAI API key
if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OpenAI API key');
}

// Initialize OpenAI with error handling
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    try {
        if (event.httpMethod !== 'POST') {
            throw new Error('Method not allowed');
        }

        const { operation, params } = JSON.parse(event.body);

        if (!operation) {
            throw new Error('Operation type is required');
        }

        let systemPrompt;
        let userPrompt;
        
        switch (operation) {
            case 'generateBusinessNames':
                systemPrompt = "You are a creative business naming expert.";
                userPrompt = `Generate 5 creative and unique business names for a ${params.industry} startup. Consider these keywords: ${params.keywords}. Format the response as a numbered list.`;
                break;
            case 'generateEmailTemplates':
                systemPrompt = "You are a professional email writing expert.";
                userPrompt = `Write a professional email template for ${params.purpose}. Include subject line and body.`;
                break;
            default:
                throw new Error('Invalid operation type');
        }

        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        if (!completion.data || !completion.data.choices || completion.data.choices.length === 0) {
            throw new Error('No response from OpenAI API');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                result: completion.data.choices[0].message.content.trim()
            })
        };

    } catch (error) {
        console.error('Error in AI operation:', error);
        
        return {
            statusCode: error.response?.status || 500,
            headers,
            body: JSON.stringify({
                error: error.message || 'Internal server error',
                details: error.response?.data || null
            })
        };
    }
};