import express from 'express';
import axios from 'axios';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    console.log('WordPress auth health check requested');
    res.json({
        status: 'healthy',
        service: 'wordpress-auth',
        timestamp: new Date().toISOString()
    });
});

// Initialize OAuth flow
router.get('/init-auth', (req, res) => {
    const clientRedirectUri = req.query.redirect_uri || '';
    const clientHost = req.query.client_host;

    if (!clientHost) {
        return res.status(400).json({ error: 'Missing client_host parameter' });
    }

    console.log('Client details:', {
        host: clientHost,
        redirectUri: clientRedirectUri
    });

    // Include client's redirect URI and host in the state
    const stateData = {
        random: Math.random().toString(36).substring(7),
        redirect_uri: clientRedirectUri || `${clientHost}/oauth/callback`,
        origin: clientHost
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    const authUrl = new URL('https://public-api.wordpress.com/oauth2/authorize');
    authUrl.searchParams.append('client_id', process.env.WORDPRESS_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', process.env.WORDPRESS_WEBHOOK_URL);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'global');
    authUrl.searchParams.append('state', state);

    console.log('Auth URL:', authUrl.toString());
    res.redirect(authUrl.toString());
});

// Handle OAuth callback
router.get('/webhook', async (req, res) => {
    const { code: webhookCode, state: webhookState } = req.query;

    let clientRedirectUrl;
    let clientOrigin;
    try {
        const stateObj = JSON.parse(Buffer.from(webhookState, 'base64').toString());
        clientRedirectUrl = stateObj.redirect_uri;
        clientOrigin = stateObj.origin;
        console.log('Client redirect URL:', clientRedirectUrl);
        console.log('Client origin:', clientOrigin);
    } catch (error) {
        return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Exchange code for tokens
    try {
        const tokenResponse = await axios.post(
            'https://public-api.wordpress.com/oauth2/token',
            new URLSearchParams({
                client_id: process.env.WORDPRESS_CLIENT_ID,
                client_secret: process.env.WORDPRESS_CLIENT_SECRET,
                redirect_uri: process.env.WORDPRESS_WEBHOOK_URL,
                code: webhookCode,
                grant_type: 'authorization_code'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log('Token response:', tokenResponse.data);

        const { access_token } = tokenResponse.data;

        // Use clientRedirectUrl directly
        const redirectUrl = new URL(clientRedirectUrl);
        redirectUrl.searchParams.set('access_token', access_token);
        redirectUrl.searchParams.set('state', webhookState);

        console.log('Redirecting to:', redirectUrl.toString());
        res.redirect(redirectUrl.toString());
    } catch (error) {
        console.error('Token exchange failed:', error.response?.data || error);
        res.status(500).json({ 
            error: 'Failed to process OAuth callback',
            details: error.response?.data || error.message
        });
    }
});

export default router; 