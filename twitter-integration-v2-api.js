const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL = process.env.TWITTER_CALLBACK_URL;

// Generate PKCE (Code Verifier and Challenge)
const generateCodeVerifier = () => crypto.randomBytes(32).toString('base64url');
const generateCodeChallenge = (codeVerifier) => {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
};

// Temporary storage for tokens
let codeVerifier = '';
let accessToken = '';

// Step 1: Redirect to Twitter Login
app.get('/twitter/auth', (req, res) => {
  codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    CALLBACK_URL
  )}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=random_state&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  res.redirect(url);
});

// Step 2: Handle Callback and Exchange Code for Tokens
app.get('/twitter/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || state !== 'random_state') {
    return res.status(400).send('Invalid callback request.');
  }

  try {
    const tokenResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        code_verifier: codeVerifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    accessToken = tokenResponse.data.access_token;
    console.log('Access Token:', accessToken);

    res.send('Twitter authentication successful!');
  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    res.status(500).send('Failed to authenticate with Twitter.');
  }
});

// Step 3: Make Authenticated API Calls
app.get('/twitter/user', async (req, res) => {
  if (!accessToken) {
    return res.status(400).send('User is not authenticated.');
  }

  try {
    const response = await axios.get('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching user info:', error.response?.data || error.message);
    res.status(500).send('Failed to fetch user info.');
  }
});

// Step 4: Post a Tweet
app.post('/twitter/tweet', async (req, res) => {
    const text = "Hello How are you?"; // The text of the tweet to post
  
    if (!accessToken) {
      return res.status(400).send('User is not authenticated.');
    }
  
    if (!text || text.trim().length === 0) {
      return res.status(400).send('Tweet text cannot be empty.');
    }
  
    try {
      const response = await axios.post(
        'https://api.twitter.com/2/tweets',
        { text },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
  
      res.json({
        success: true,
        data: response.data,
      });
    } catch (error) {
      console.error('Error posting tweet:', error.response?.data || error.message);
      res.status(500).send('Failed to post tweet.');
    }
  });

// Start the server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));