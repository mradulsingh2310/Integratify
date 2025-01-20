const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3001;
const SERVER_BASE_URL = "https://autoseoguys.onrender.com";

// Store tokens
let accessToken = '';
let refreshToken = '';

// Middleware for parsing JSON
app.use(express.json());

// Step 1: Redirect to Google OAuth via our auth server
app.get('/google-business/auth', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/oauth/callback`;
    
    console.log('Initiating auth with redirect URI:', redirectUri);

    const authUrl = `${SERVER_BASE_URL}/google-business/init-auth?` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `client_host=${encodeURIComponent(`${protocol}://${host}`)}`;
    
    console.log('Redirecting to:', authUrl);
    res.redirect(authUrl);
});

// Step 2: Handle OAuth Callback
app.get('/oauth/callback', (req, res) => {
    const { 
        access_token, 
        refresh_token, 
        expires_in,
        state 
    } = req.query;
    
    if (!access_token || !refresh_token) {
        console.error('Missing tokens in callback');
        return res.status(400).send('Authentication failed - missing tokens');
    }

    try {
        // Store tokens
        accessToken = access_token;
        refreshToken = refresh_token;

        console.log('Access token:', accessToken);
        console.log('Refresh token:', refreshToken);

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

// Step 3: Fetch business accounts
app.get('/google-business/accounts', async (req, res) => {
    try {
        const response = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        res.json(response.data);
    } catch (error) {
        if (error.response?.status === 401) {
            try {
                // Token expired, try to refresh it
                const refreshResponse = await axios.post(`${SERVER_BASE_URL}/refresh-token`, {
                    refresh_token: refreshToken
                });
                accessToken = refreshResponse.data.access_token;
                
                // Retry the request with new token
                const response = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });
                res.json(response.data);
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                res.status(401).json({ error: 'Authentication failed' });
            }
        } else {
            console.error('Error fetching accounts:', error);
            res.status(500).json({ error: 'Failed to fetch accounts' });
        }
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
    console.log(`Google Business API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});