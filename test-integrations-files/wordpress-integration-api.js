const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const SERVER_BASE_URL = "https://autoseoguys.onrender.com";

// Store tokens
let accessToken = '';

// Middleware for parsing JSON
app.use(express.json());

// Step 1: Redirect to WordPress OAuth via our auth server
app.get('/wordpress/auth', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/oauth/callback`;
    
    console.log('Initiating auth with redirect URI:', redirectUri);

    const authUrl = `${SERVER_BASE_URL}/wordpress/init-auth?` +
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

// Step 3: Get Site IDs
app.get('/wordpress/sites', async (req, res) => {
    if (!accessToken) {
        return res.status(401).send('Unauthorized: Please authenticate first.');
    }

    try {
        const response = await axios.get('https://public-api.wordpress.com/rest/v1.1/me/sites', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const sites = response.data.sites.map(site => ({
            siteId: site.ID,
            name: site.name,
            URL: site.URL,
        }));

        res.json({
            message: 'Retrieved site details successfully!',
            sites,
        });
    } catch (error) {
        console.error('Error fetching site details:', error.response?.data || error.message);
        res.status(500).send('Failed to retrieve site details.');
    }
});

// Step 4: Create a Blog Post
app.post('/wordpress/post', async (req, res) => {
    const { siteId, title, content, status, categories, tags } = req.body;

    if (!accessToken) {
        return res.status(401).send('Unauthorized: Please authenticate first.');
    }

    try {
        const response = await axios.post(
            `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`,
            {
                title,
                content,
                status: status || 'publish',
                categories,
                tags,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.json({
            message: 'Post created successfully!',
            post: response.data,
        });
    } catch (error) {
        console.error('Error creating post:', error.response?.data || error.message);
        res.status(500).send('Failed to create post.');
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
    console.log(`WordPress Integration API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});