const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event, context) => {
    try {
        const { email, userName = 'Valued Customer' } = JSON.parse(event.body);

        const msg = {
            to: email,
            from: 'hatem.shaban@gmail.com',
            subject: 'Your StartupStack Trial Ends Soon',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #6B46C1;">Your StartupStack Trial is Ending</h2>
                    <p>Hi ${userName},</p>
                    <p>Your StartupStack free trial ends in 3 days. Don't lose access to your AI tools!</p>
                    <p>Upgrade now to continue:</p>
                    <ul>
                        <li>All 8 AI-powered tools</li>
                        <li>Premium templates</li>
                        <li>Priority support</li>
                        <li>Advanced features</li>
                        <li>API access</li>
                    </ul>
                    <a href="${process.env.URL}/upgrade" 
                       style="display: inline-block; background: #6B46C1; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; margin-top: 20px;">
                        Upgrade Now
                    </a>
                    <p style="margin-top: 30px;">
                        Need help? Reply to this email for support.
                    </p>
                </div>
            `
        };

        await sgMail.send(msg);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Trial ending email sent successfully' })
        };
    } catch (error) {
        console.error('Error sending trial ending email:', error);
        return {
            statusCode: error.code || 500,
            body: JSON.stringify({ error: 'Failed to send trial ending email' })
        };
    }
};
