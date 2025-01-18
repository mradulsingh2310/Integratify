import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import qs from 'querystring';

const router = express.Router();

// Store states and tokens temporarily (use Redis in production)
const stateStore = new Map();
const tokenSecretStore = new Map();

// Utility function to generate OAuth 1.0 signature
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret = '') {
    const baseString = [
        method.toUpperCase(),
        encodeURIComponent(url),
        encodeURIComponent(
            Object.keys(params)
                .sort()
                .map(key => `${key}=${encodeURIComponent(params[key])}`)
                .join('&')
        ),
    ].join('&');

    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

// Health check endpoint
router.get('/health', (req, res) => {
    console.log('Tumblr auth health check requested');
    res.json({
        status: 'healthy',
        service: 'tumblr-auth',
        timestamp: new Date().toISOString()
    });
});

// Initialize OAuth flow
router.get('/init-auth', async (req, res) => {
    const clientRedirectUri = req.query.redirect_uri || '';
    const clientHost = req.query.client_host;

    if (!clientHost) {
        return res.status(400).json({ error: 'Missing client_host parameter' });
    }

    // Store client info in state
    const stateData = {
        random: Math.random().toString(36).substring(7),
        redirect_uri: clientRedirectUri || `${clientHost}/oauth/callback`,
        origin: clientHost
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    const stateKey = crypto.randomBytes(16).toString('hex');
    stateStore.set(stateKey, state);

    const url = 'https://www.tumblr.com/oauth/request_token';
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);

    const params = {
        oauth_consumer_key: process.env.TUMBLR_CONSUMER_KEY,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_version: '1.0',
        oauth_callback: `${process.env.TUMBLR_WEBHOOK_URL}?state_key=${stateKey}`,
    };

    params.oauth_signature = generateOAuthSignature('POST', url, params, process.env.TUMBLR_CONSUMER_SECRET);

    try {
        const response = await axios.post(url, null, {
            headers: {
                Authorization: `OAuth ${Object.keys(params)
                    .map(key => `${key}="${encodeURIComponent(params[key])}"`)
                    .join(', ')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const responseParams = qs.parse(response.data);
        const oauthToken = responseParams.oauth_token;
        tokenSecretStore.set(oauthToken, responseParams.oauth_token_secret);
        console.log('Tumblr auth token:', oauthToken);
        console.log('Tumblr auth token secret:', responseParams.oauth_token_secret);

        res.redirect(`https://www.tumblr.com/oauth/authorize?oauth_token=${oauthToken}`);
    } catch (error) {
        console.error('Error requesting token:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to request token' });
    }
});

// Handle OAuth callback
router.get('/webhook', async (req, res) => {
    const { oauth_token, oauth_verifier, state_key } = req.query;

    // Retrieve state and token secret
    const state = stateStore.get(state_key);
    const tokenSecret = tokenSecretStore.get(oauth_token);

    if (!state || !tokenSecret) {
        return res.status(400).json({ error: 'Invalid or expired state/token' });
    }

    // Clean up stores
    stateStore.delete(state_key);
    tokenSecretStore.delete(oauth_token);

    let clientRedirectUrl;
    let clientOrigin;
    try {
        const stateObj = JSON.parse(Buffer.from(state, 'base64').toString());
        clientRedirectUrl = stateObj.redirect_uri;
        clientOrigin = stateObj.origin;
    } catch (error) {
        return res.status(400).json({ error: 'Invalid state data' });
    }

    const url = 'https://www.tumblr.com/oauth/access_token';
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);

    const params = {
        oauth_consumer_key: process.env.TUMBLR_CONSUMER_KEY,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_version: '1.0',
        oauth_token,
        oauth_verifier
    };

    params.oauth_signature = generateOAuthSignature('POST', url, params, process.env.TUMBLR_CONSUMER_SECRET, tokenSecret);

    try {
        const response = await axios.post(url, null, {
            headers: {
                Authorization: `OAuth ${Object.keys(params)
                    .map(key => `${key}="${encodeURIComponent(params[key])}"`)
                    .join(', ')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const responseParams = qs.parse(response.data);
        const accessToken = responseParams.oauth_token;
        const accessTokenSecret = responseParams.oauth_token_secret;

        // Redirect back to client with tokens
        const redirectUrl = new URL(clientRedirectUrl);
        redirectUrl.searchParams.set('access_token', accessToken);
        redirectUrl.searchParams.set('access_token_secret', accessTokenSecret);
        redirectUrl.searchParams.set('state', state);

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