const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let userAccessToken = ''; // To store user access token temporarily
let pageAccessToken = ''; // To store page access token temporarily
let pageId = ''; // To store page ID temporarily

// Step 1: Redirect to Facebook Login
app.get('/facebook/auth', (req, res) => {
  const fbLoginUrl = `https://www.facebook.com/v16.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&state=random_string&scope=email%2Cpages_manage_posts`;
  res.redirect(fbLoginUrl);
});

// Step 2: Handle Callback
app.get('/facebook/callback', async (req, res) => {
  const { code } = req.query;
  console.log('Authorization code:', code);

  try {
    // Exchange code for access token
    const response = await axios.get(`https://graph.facebook.com/v16.0/oauth/access_token`, {
      params: {
        client_id: APP_ID,
        redirect_uri: REDIRECT_URI,
        client_secret: APP_SECRET,
        code,
      },
    });

    userAccessToken = response.data.access_token;

    console.log('User Access Token:', userAccessToken);

    res.send('Facebook authentication successful! You can now use the API.');
  } catch (error) {
    console.error('Error exchanging code for token:', error.response.data);
    res.status(500).send('Failed to authenticate.');
  }
});

// Step 3: Fetch User’s Pages
app.get('/facebook/pages', async (req, res) => {
  try {
    const response = await axios.get('https://graph.facebook.com/v16.0/me/accounts', {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
    pageAccessToken = response.data.data[0].access_token;
    pageId = response.data.data[0].id;
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching pages:', error.response.data);
    res.status(500).send('Failed to fetch pages.');
  }
});

// Step 4: Post to a Page
app.post('/facebook/post', async (req, res) => {
  const pageToken = pageAccessToken; // Replace with the page access token from `/facebook/pages`

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v16.0/${pageId}/feed`,
      { message: 'Hello from my app!' },
      { headers: { Authorization: `Bearer ${pageToken}` } }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error posting to page:', error.response.data);
    res.status(500).send('Failed to create post.');
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));