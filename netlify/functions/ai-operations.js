const { Configuration, OpenAIApi } = require('openai');
const { createClient } = require('@supabase/supabase-js');

// Validate OpenAI API key
if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OpenAI API key');
}

// Initialize OpenAI with error handling
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

// Initialize Supabase with proper error handling
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false
        }
    }
);

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    try {        if (event.httpMethod !== 'POST') {
            throw new Error('Method not allowed');
        }

        const { operation, params, userId } = JSON.parse(event.body);

        if (!operation) {
            throw new Error('Operation type is required');
        }

        // Track tool usage on server side as well if userId is provided
        // This adds redundancy to ensure tracking even if client-side fails
        if (userId) {
            try {
                await supabase
                    .from('tool_usage')
                    .insert([{
                        user_id: userId,
                        tool_name: operation,
                        input_data: params || {}
                    }]);
            } catch (trackingErr) {
                console.error('Server-side usage tracking error:', trackingErr);
                // Continue with operation even if tracking fails
            }
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
        });        if (!completion.data || !completion.data.choices || completion.data.choices.length === 0) {
            throw new Error('No response from OpenAI API');
        }

        const result = completion.data.choices[0].message.content.trim();
        
        // Save the generated content to the database if we have a userId
        if (userId) {
            try {
                await supabase
                    .from('generated_content')
                    .insert([{
                        user_id: userId,
                        tool_type: operation,
                        content: {
                            input: params || {},
                            output: result
                        }
                    }]);
            } catch (contentErr) {
                console.error('Server-side content saving error:', contentErr);
                // Continue with response even if saving fails
            }
            
            // Update the tool_usage record with the output
            try {
                const { data: usageRecords } = await supabase
                    .from('tool_usage')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('tool_name', operation)
                    .order('used_at', { ascending: false })
                    .limit(1);
                
                if (usageRecords && usageRecords.length > 0) {
                    await supabase
                        .from('tool_usage')
                        .update({
                            output_data: { result }
                        })
                        .eq('id', usageRecords[0].id);
                }
            } catch (updateErr) {
                console.error('Error updating tool usage with output:', updateErr);
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                result: result
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