import express from 'express';
import axios from 'axios';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    console.log('Facebook auth health check requested');
    res.json({
        status: 'healthy',
        service: 'facebook-auth',
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

    const authUrl = new URL('https://www.facebook.com/v16.0/dialog/oauth');
    authUrl.searchParams.append('client_id', process.env.FACEBOOK_APP_ID);
    authUrl.searchParams.append('redirect_uri', process.env.FACEBOOK_WEBHOOK_URL);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'email,pages_manage_posts,pages_show_list,pages_read_engagement');
    authUrl.searchParams.append('response_type', 'code');

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

    try {
        // Exchange code for access token
        const tokenResponse = await axios.get('https://graph.facebook.com/v16.0/oauth/access_token', {
            params: {
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                redirect_uri: process.env.FACEBOOK_WEBHOOK_URL,
                code: webhookCode
            }
        });

        console.log('Token response:', tokenResponse.data);
        const { access_token } = tokenResponse.data;

        // Get long-lived access token
        const longLivedTokenResponse = await axios.get('https://graph.facebook.com/v16.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                fb_exchange_token: access_token
            }
        });

        const longLivedToken = longLivedTokenResponse.data.access_token;

        // Use clientRedirectUrl directly
        const redirectUrl = new URL(clientRedirectUrl);
        redirectUrl.searchParams.set('access_token', longLivedToken);
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