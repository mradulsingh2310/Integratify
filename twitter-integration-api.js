const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Environment Variables
const CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;
const CALLBACK_URL = process.env.TWITTER_CALLBACK_URL;

// Middleware for parsing JSON
app.use(express.json());

// In-memory storage for tokens (use a database for production)
let accessToken = '';
let accessTokenSecret = '';
let bearerToken = '';
let accountId = '';

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

// Step 1: Request Token
app.get('/twitter/auth', async (req, res) => {
  const url = 'https://api.twitter.com/oauth/request_token';
  const params = {
    oauth_callback: CALLBACK_URL,
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_version: '1.0',
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
    const oauthToken = tokenData.get('oauth_token');
    res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`);
  } catch (error) {
    console.error('Error requesting token:', error.response?.data || error.message);
    res.status(500).send('Failed to request token.');
  }
});

// Step 2: Handle Callback
app.get('/twitter/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

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
    accessToken = tokenData.get('oauth_token');
    accessTokenSecret = tokenData.get('oauth_token_secret');
    const screenName = tokenData.get('screen_name');
    accountId = tokenData.get('user_id');

    console.log('Access Token:', accessToken);
    console.log('Access Secret:', accessTokenSecret);
    console.log('Account ID:', accountId);

    res.send(`Login successful! Welcome, ${screenName}.`);
  } catch (error) {
    console.error('Error exchanging token:', error.response?.data || error.message);
    res.status(500).send('Failed to authenticate.');
  }
});

// Step 3: Get Bearer Token
app.get('/twitter/bearer', async (req, res) => {
  const url = 'https://api.twitter.com/oauth2/token';

  try {
    const response = await axios.post(
      url,
      new URLSearchParams({ grant_type: 'client_credentials' }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    bearerToken = response.data.access_token;
    console.log('Bearer Token:', bearerToken);
    res.send(`Bearer Token obtained successfully: ${bearerToken}`);
  } catch (error) {
    console.error('Error obtaining bearer token:', error.response?.data || error.message);
    res.status(500).send('Failed to obtain bearer token.');
  }
});

// Step 4: Get All Credentials
app.get('/twitter/credentials', (req, res) => {
  if (!accessToken || !accessTokenSecret || !bearerToken || !accountId) {
    return res.status(400).send('Complete the authentication process first.');
  }

  res.json({
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET,
    bearer_token: bearerToken,
    access_token: accessToken,
    access_token_secret: accessTokenSecret,
    account_id: accountId,
  });
});

// Start the Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));