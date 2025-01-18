const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3001;
const SERVER_BASE_URL = "https://autoseoguys.onrender.com";

// Store tokens
let accessToken = '';
let accessTokenSecret = '';

// Middleware for parsing JSON
app.use(express.json());

// Step 1: Redirect to Tumblr OAuth via our auth server
app.get('/tumblr/auth', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/oauth/callback`;
    
    console.log('Initiating auth with redirect URI:', redirectUri);

    const authUrl = `${SERVER_BASE_URL}/tumblr/init-auth?` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `client_host=${encodeURIComponent(`${protocol}://${host}`)}`;
    
    console.log('Redirecting to:', authUrl);
    res.redirect(authUrl);
});

// Step 2: Handle OAuth Callback
app.get('/oauth/callback', (req, res) => {
    const { access_token, access_token_secret, state } = req.query;
    
    if (!access_token || !access_token_secret) {
        console.error('Missing tokens in callback');
        return res.status(400).send('Authentication failed - missing tokens');
    }

    try {
        // Store tokens
        accessToken = access_token;
        accessTokenSecret = access_token_secret;

        // Decode state to verify origin
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('Received callback with state:', stateData);

        res.status(200).json({ 
            message: 'Authentication successful'
        });
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send('Authentication failed.');
    }
});

// Get user info endpoint
app.get('/tumblr/user', async (req, res) => {
    if (!accessToken || !accessTokenSecret) {
        return res.status(400).send('Complete the authentication process first.');
    }

    try {
        const response = await axios.get('https://api.tumblr.com/v2/user/info', {
            headers: {
                Authorization: `OAuth oauth_consumer_key="${process.env.TUMBLR_CONSUMER_KEY}", oauth_token="${accessToken}"`
            }
        });
        res.json(response.data.response.user);
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ error: 'Failed to fetch user info' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Tumblr Integration API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});