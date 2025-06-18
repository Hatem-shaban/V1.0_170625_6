const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase configuration');
}

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

    try {
        if (event.httpMethod !== 'POST') {
            throw new Error('Method not allowed');
        }

        const { customerEmail, userId, priceId } = JSON.parse(event.body);

        if (!customerEmail || !userId) {
            throw new Error('Missing required fields');
        }

        // Verify user exists
        const { data: existingUser, error: userError } = await supabase
            .from('users')
            .select('id, email, subscription_status')
            .eq('id', userId)
            .eq('email', customerEmail)
            .single();

        if (userError) {
            console.error('User verification error:', userError);
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'User not found' })
            };
        }        // Determine plan type based on the price ID
        let planType;
        switch(priceId) {
            case 'price_1RYhFGE92IbV5FBUqiKOcIqX':
                planType = 'lifetime';
                break;
            case 'price_1RYhAlE92IbV5FBUCtOmXIow':
                planType = 'starter';
                break;
            case 'price_1RSdrmE92IbV5FBUV1zE2VhD':
                planType = 'pro';
                break;
            default:
                planType = 'subscription'; // Fallback
        }
        
        // Determine if it's a lifetime plan for checkout mode purposes
        const isLifetimePlan = planType === 'lifetime';
        
        // Create Stripe checkout session with specified price ID
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: isLifetimePlan ? 'payment' : 'subscription',
            line_items: [{
                price: priceId || process.env.STRIPE_PRICE_ID, // Use provided price ID or fallback to default
                quantity: 1,
            }],
            success_url: `${process.env.URL}/success.html?session_id={CHECKOUT_SESSION_ID}&userId=${userId}`,
            cancel_url: `${process.env.URL}?checkout=cancelled`,
            customer_email: customerEmail,            metadata: {
                userId: userId,
                priceId: priceId || process.env.STRIPE_PRICE_ID,
                planType: planType // Store plan type in metadata for success page to use
            }
        });        // Update user status with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        let updateError;

        while (retryCount < maxRetries) {            const { error } = await supabase
                .from('users')
                .update({                    subscription_status: isLifetimePlan ? 'pending_lifetime' : 'pending_activation',
                    stripe_session_id: session.id,
                    // Remove selected_plan as it doesn't exist in the database
                    updated_at: new Date().toISOString(),
                    plan_type: planType // Set plan_type directly based on priceId
                })
                .eq('id', userId);

            if (!error) {
                updateError = null;
                break;
            }

            updateError = error;
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        }

        if (updateError) {
            console.error('Error updating user status after retries:', updateError);
            // Even if update fails, continue with checkout
            // The webhook will attempt to update the status again
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                id: session.id,
                userId: userId,
                success: true
            })
        };

    } catch (error) {
        console.error('Create checkout session error:', error);
        return {
            statusCode: error.statusCode || 500,
            headers,
            body: JSON.stringify({ 
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error : undefined
            })
        };
    }
};