const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;
const SERVER_BASE_URL = "https://cb39-2401-4900-1c23-7ad4-c113-54b8-a9cd-e316.ngrok-free.app"; // URL of our new Express OAuth server

let accessToken = '';
let refreshToken = '';

// Step 1: Redirect to Google OAuth via our Express server
app.get('/blogger/auth', (req, res) => {
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
app.get('/oauth/callback', async (req, res) => {
    const { access_token, refresh_token, state } = req.query;
    
    if (!access_token || !refresh_token) {
        console.error('Missing tokens in callback');
        return res.status(400).send('Authentication failed - missing tokens');
    }

    try {
        // Store tokens
        accessToken = access_token;
        refreshToken = refresh_token;

        // Decode state to verify origin
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('Received callback with state:', stateData);

        // Return success response with tokens
        res.status(200).json({ 
            message: 'Authentication successful', 
            access_token, 
            refresh_token 
        });
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send('Authentication failed.');
    }
});

// Helper function to refresh token using our Express server
async function refreshAccessToken() {
    try {
        const response = await axios.post(`${SERVER_BASE_URL}/refresh-token`, {
            refresh_token: refreshToken
        });

        accessToken = response.data.access_token;
        return accessToken;
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw error;
    }
}

// Example endpoint using the access token
app.get('/blogger/blogs', async (req, res) => {
    try {
        const response = await axios.get('https://www.googleapis.com/blogger/v3/users/self/blogs', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        res.json(response.data);
    } catch (error) {
        if (error.response?.status === 401) {
            try {
                // Token expired, try to refresh it
                await refreshAccessToken();
                // Retry the request with new token
                const response = await axios.get('https://www.googleapis.com/blogger/v3/users/self/blogs', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                res.json(response.data);
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                res.status(401).json({ error: 'Authentication failed' });
            }
        } else {
            console.error('Error fetching blogs:', error);
            res.status(500).json({ error: 'Failed to fetch blogs' });
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
    console.log(`Blogger Integration API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});