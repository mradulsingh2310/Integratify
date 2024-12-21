const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const qs = require('querystring');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = 3000;
const CONSUMER_KEY = process.env.TUMBLR_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.TUMBLR_CONSUMER_SECRET;
const CALLBACK_URL = process.env.TUMBLR_CALLBACK_URL;

let oauthTokenSecret = '';
let accessToken = '';
let accessTokenSecret = '';

// Utility function to generate OAuth 1.0 signature
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret = '') {
  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(
      Object.keys(params)
        .sort()
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&')
    ),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

// Step 1: Get Request Token
app.get('/tumblr/auth', async (req, res) => {
  const url = 'https://www.tumblr.com/oauth/request_token';
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  const params = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
    oauth_callback: CALLBACK_URL,
  };

  params.oauth_signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET);

  try {
    const response = await axios.post(url, null, {
      headers: {
        Authorization: `OAuth ${Object.keys(params)
          .map(key => `${key}="${encodeURIComponent(params[key])}"`)
          .join(', ')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const responseParams = qs.parse(response.data);
    oauthTokenSecret = responseParams.oauth_token_secret;

    res.redirect(`https://www.tumblr.com/oauth/authorize?oauth_token=${responseParams.oauth_token}`);
  } catch (error) {
    console.error('Error fetching request token:', error.response?.data || error.message);
    res.status(500).send('Failed to get request token.');
  }
});

// Step 2: Handle Authorization Callback
app.get('/tumblr/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  console.log('OAuth Verifier:', req.query);

  const url = 'https://www.tumblr.com/oauth/access_token';
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  const params = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
    oauth_token: req.query.oauth_token,
    oauth_verifier: req.query.oauth_verifier,
  };

  params.oauth_signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET, oauthTokenSecret);

  try {
    const response = await axios.post(url, null, {
      headers: {
        Authorization: `OAuth ${Object.keys(params)
          .map(key => `${key}="${encodeURIComponent(params[key])}"`)
          .join(', ')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const responseParams = qs.parse(response.data);
    accessToken = responseParams.oauth_token;
    accessTokenSecret = responseParams.oauth_token_secret;

    console.log('Access Token:', accessToken);
    console.log('Access Token Secret:', accessTokenSecret);

    res.send('Tumblr authentication successful!');
  } catch (error) {
    console.error('Error exchanging request token for access token:', error.response?.data || error.message);
    res.status(500).send('Failed to authenticate with Tumblr.');
  }
});

// Step 3: Fetch User Info
app.get('/tumblr/user', async (req, res) => {
  const url = 'https://api.tumblr.com/v2/user/info';
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  const params = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
    oauth_token: accessToken,
  };

  params.oauth_signature = generateOAuthSignature('GET', url, params, CONSUMER_SECRET, accessTokenSecret);

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `OAuth ${Object.keys(params)
          .map(key => `${key}="${encodeURIComponent(params[key])}"`)
          .join(', ')}`,
      },
    });

    res.json(response.data.response.user);
  } catch (error) {
    console.error('Error fetching user info:', error.response?.data || error.message);
    res.status(500).send('Failed to fetch user info.');
  }
});
const createPost = async (blogIdentifier, content) => {
    const url = `https://api.tumblr.com/v2/blog/${blogIdentifier}/post`;
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
  
    const params = {
      oauth_consumer_key: CONSUMER_KEY,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
      oauth_token: accessToken,
      type: 'text',
      body: content,
    };
  
    // Generate OAuth signature
    params.oauth_signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET, accessTokenSecret);
  
    try {
      const response = await axios.post(
        url,
        new URLSearchParams({ type: 'text', body: content }),
        {
          headers: {
            Authorization: `OAuth ${Object.keys(params)
              .map(key => `${key}="${encodeURIComponent(params[key])}"`)
              .join(', ')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
  
      console.log('Post created successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating post:', error.response?.data || error.message);
      throw new Error('Failed to create post.');
    }
  };

  app.post('/tumblr/create-post', async (req, res) => {
    const blogIdentifier = (await axios.get('https://api.tumblr.com/v2/user/info', {
      headers: {
        Authorization: `OAuth oauth_consumer_key="${CONSUMER_KEY}", oauth_token="${accessToken}"`,
      },
    })).data.response.user.blogs[0].name;
    const { content } = "Hello How are you?";
  
    try {
      const result = await createPost(blogIdentifier, content);
      res.json({ message: 'Post created successfully!', data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
// Start the server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));