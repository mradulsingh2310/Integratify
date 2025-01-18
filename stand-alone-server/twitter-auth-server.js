import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Environment Variables
const CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;
const CALLBACK_URL = process.env.WEBHOOK_URL;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Helper Function: Generate OAuth 1.0a Signature
const generateOAuthSignature = (method, url, params, consumerSecret, tokenSecret = '') => {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
};

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// Store states temporarily in memory (in production, use Redis or similar)
const stateStore = new Map();

// Initialize OAuth flow
app.get('/init-auth', async (req, res) => {
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

    // Store state with random key
    const stateKey = crypto.randomBytes(16).toString('hex');
    stateStore.set(stateKey, state);

    const url = 'https://api.twitter.com/oauth/request_token';
    const params = {
        // Include stateKey in the callback URL
        oauth_callback: `${CALLBACK_URL}?state_key=${stateKey}`,
        oauth_consumer_key: CONSUMER_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_version: '1.0'
    };
    params.oauth_signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET);
    console.log('Requesting token with params:', params);

    try {
        const response = await axios.post(url, null, {
            headers: {
                Authorization: `OAuth ${Object.keys(params)
                    .map(key => `${key}="${encodeURIComponent(params[key])}"`)
                    .join(', ')}`,
            },
        });

        console.log('Response from Twitter:', response.data);

        const tokenData = new URLSearchParams(response.data);
        const oauthToken = tokenData.get('oauth_token');
        console.log('OAuth token:', oauthToken);
        
        // Redirect without state parameter
        res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`);
    } catch (error) {
        console.error('Error requesting token:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to request token' });
    }
});

// Handle OAuth callback
app.get('/webhook', async (req, res) => {
    const { oauth_token, oauth_verifier, state_key } = req.query;

    // Retrieve state from store
    const state = stateStore.get(state_key);
    if (!state) {
        return res.status(400).json({ error: 'Invalid or expired state key' });
    }

    // Clean up state store
    stateStore.delete(state_key);

    let clientRedirectUrl;
    let clientOrigin;
    try {
        const stateObj = JSON.parse(Buffer.from(state, 'base64').toString());
        clientRedirectUrl = stateObj.redirect_uri;
        clientOrigin = stateObj.origin;
        console.log('Retrieved state data:', stateObj);
    } catch (error) {
        return res.status(400).json({ error: 'Invalid state data' });
    }

    const url = 'https://api.twitter.com/oauth/access_token';
    const params = {
        oauth_consumer_key: CONSUMER_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_version: '1.0',
        oauth_token,
        oauth_verifier,
    };
    params.oauth_signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET);

    try {
        const response = await axios.post(url, null, {
            headers: {
                Authorization: `OAuth ${Object.keys(params)
                    .map(key => `${key}="${encodeURIComponent(params[key])}"`)
                    .join(', ')}`,
            },
        });

        const tokenData = new URLSearchParams(response.data);
        const accessToken = tokenData.get('oauth_token');
        const accessTokenSecret = tokenData.get('oauth_token_secret');
        const screenName = tokenData.get('screen_name');
        const accountId = tokenData.get('user_id');

        // Get bearer token
        const bearerTokenResponse = await axios.post(
            'https://api.twitter.com/oauth2/token',
            new URLSearchParams({ grant_type: 'client_credentials' }),
            {
                headers: {
                    Authorization: `Basic ${Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const bearerToken = bearerTokenResponse.data.access_token;

        // Redirect back to client with all tokens
        const redirectUrl = new URL('/oauth/callback', clientOrigin);
        redirectUrl.searchParams.set('access_token', accessToken);
        redirectUrl.searchParams.set('access_token_secret', accessTokenSecret);
        redirectUrl.searchParams.set('bearer_token', bearerToken);
        redirectUrl.searchParams.set('account_id', accountId);
        redirectUrl.searchParams.set('screen_name', screenName);
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        details: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Twitter Auth Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app; 