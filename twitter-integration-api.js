const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3001;
const SERVER_BASE_URL = "https://cb39-2401-4900-1c23-7ad4-c113-54b8-a9cd-e316.ngrok-free.app";

// Store tokens
let accessToken = '';
let accessTokenSecret = '';
let bearerToken = '';
let accountId = '';
let screenName = '';

// Middleware for parsing JSON
app.use(express.json());

// Step 1: Redirect to Twitter OAuth via our auth server
app.get('/twitter/auth', (req, res) => {
    // Get the full URL of where we want to receive the callback
    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/oauth/callback`;
    
    console.log('Initiating auth with redirect URI:', redirectUri);

    // Include both redirect_uri and client_host in the query parameters
    const authUrl = `${SERVER_BASE_URL}/init-auth?` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `client_host=${encodeURIComponent(`${protocol}://${host}`)}`;
    
    console.log('Redirecting to:', authUrl);
    res.redirect(authUrl);
});

// Step 2: Handle OAuth Callback
app.get('/oauth/callback', (req, res) => {
    const { 
        access_token, 
        access_token_secret, 
        bearer_token,
        account_id,
        screen_name,
        state 
    } = req.query;
    
    if (!access_token || !access_token_secret || !bearer_token) {
        console.error('Missing tokens in callback');
        return res.status(400).send('Authentication failed - missing tokens');
    }

    try {
        // Store tokens
        accessToken = access_token;
        accessTokenSecret = access_token_secret;
        bearerToken = bearer_token;
        accountId = account_id;
        screenName = screen_name;

        // Decode state to verify origin
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('Received callback with state:', stateData);
        console.log(accessToken, accessTokenSecret, bearerToken, accountId, screenName);

        res.status(200).json({ 
            message: 'Authentication successful',
            screen_name: screenName
        });
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send('Authentication failed.');
    }
});

// Get credentials endpoint
app.get('/twitter/credentials', (req, res) => {
    if (!accessToken || !accessTokenSecret || !bearerToken || !accountId) {
        return res.status(400).send('Complete the authentication process first.');
    }

    res.json({
        access_token: accessToken,
        access_token_secret: accessTokenSecret,
        bearer_token: bearerToken,
        account_id: accountId,
        screen_name: screenName
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Twitter Integration API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});