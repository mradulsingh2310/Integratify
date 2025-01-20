import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import bloggerAuthServer from './blogger-auth-server.js';
import twitterAuthServer from './twitter-auth-server.js';
import tumblrAuthServer from './tumblr-auth-server.js';
import googleBusinessAuthServer from './google-business-auth-server.js';
import wordpressAuthServer from './wordpress-auth-server.js';

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

// Mount each auth server under its own path
app.use('/blogger', bloggerAuthServer);
app.use('/twitter', twitterAuthServer);
app.use('/tumblr', tumblrAuthServer);
app.use('/google-business', googleBusinessAuthServer);
app.use('/wordpress', wordpressAuthServer);

// Root health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            blogger: true,
            twitter: true,
            tumblr: true,
            'google-business': true,
            wordpress: true
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        details: err.message
    });
});

app.listen(PORT, () => {
    console.log(`Auth Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log(`- Health check: http://localhost:${PORT}/health`);
    console.log(`- Blogger auth: http://localhost:${PORT}/blogger/init-auth`);
    console.log(`- Twitter auth: http://localhost:${PORT}/twitter/init-auth`);
    console.log(`- Tumblr auth: http://localhost:${PORT}/tumblr/init-auth`);
}); 