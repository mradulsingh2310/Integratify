const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const SERVER_BASE_URL = "https://autoseoguys.onrender.com";

// Store tokens
let accessToken = '';
let pageAccessToken = '';
let pageId = '';

// Middleware for parsing JSON
app.use(express.json());

// Step 1: Redirect to Facebook OAuth via our auth server
app.get('/facebook/auth', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/oauth/callback`;
    
    console.log('Initiating auth with redirect URI:', redirectUri);

    const authUrl = `${SERVER_BASE_URL}/facebook/init-auth?` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `client_host=${encodeURIComponent(`${protocol}://${host}`)}`;
    
    console.log('Redirecting to:', authUrl);
    res.redirect(authUrl);
});

// Step 2: Handle OAuth Callback
app.get('/oauth/callback', (req, res) => {
    const { access_token, state } = req.query;
    
    if (!access_token) {
        console.error('Missing access token in callback');
        return res.status(400).send('Authentication failed - missing token');
    }

    try {
        // Store token
        accessToken = access_token;

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

// Step 3: Fetch User's Pages
app.get('/facebook/pages', async (req, res) => {
    if (!accessToken) {
        return res.status(401).send('Unauthorized: Please authenticate first.');
    }

    try {
        const response = await axios.get('https://graph.facebook.com/v16.0/me/accounts', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        // Store the first page's access token and ID
        if (response.data.data && response.data.data.length > 0) {
            pageAccessToken = response.data.data[0].access_token;
            pageId = response.data.data[0].id;
        }

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching pages:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to fetch pages',
            details: error.response?.data || error.message
        });
    }
});

// Step 4: Post to a Page
app.post('/facebook/post', async (req, res) => {
    const { message } = req.body;

    if (!pageAccessToken || !pageId) {
        return res.status(400).send('Please fetch pages first to get page access token.');
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v16.0/${pageId}/feed`,
            { message },
            { 
                headers: { 
                    Authorization: `Bearer ${pageAccessToken}` 
                } 
            }
        );

        res.json({
            message: 'Post created successfully!',
            post: response.data
        });
    } catch (error) {
        console.error('Error posting to page:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to create post',
            details: error.response?.data || error.message
        });
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
    console.log(`Facebook Integration API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});