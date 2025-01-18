import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

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

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// Initialize OAuth flow
app.get('/init-auth', (req, res) => {
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

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/blogger');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', process.env.CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', process.env.WEBHOOK_URL);
    authUrl.searchParams.append('state', state);

    console.log('Auth URL:', authUrl.toString());
    res.redirect(authUrl.toString());
});

// Handle OAuth callback
app.get('/webhook', async (req, res) => {
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
        // Make sure to request offline access to get refresh token
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            code: webhookCode,
            grant_type: 'authorization_code',
            redirect_uri: process.env.WEBHOOK_URL,
            access_type: 'offline',  // Add this to request refresh token
            prompt: 'consent'        // Add this to force consent screen
        });

        console.log('Token exchange params:', params.toString());

        const tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            params,
            { 
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                } 
            }
        );

        console.log('Token response:', tokenResponse.data);

        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        
        if (!refresh_token) {
            console.error('No refresh token in response:', tokenResponse.data);
            return res.status(500).json({ error: 'No refresh token received' });
        }

        console.log('Access token:', access_token);
        console.log('Refresh token:', refresh_token);
        console.log('Expires in:', expires_in);

        // Redirect back to client with tokens
        const redirectUrl = new URL('/oauth/callback', clientOrigin);
        redirectUrl.searchParams.set('access_token', access_token);
        redirectUrl.searchParams.set('refresh_token', refresh_token);
        redirectUrl.searchParams.set('expires_in', expires_in);
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

// Handle token refresh
app.post('/refresh-token', async (req, res) => {
    try {
        const { refresh_token: refreshToken } = req.body;

        const response = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
            { 
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                } 
            }
        );

        res.json({
            access_token: response.data.access_token
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
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
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app; 