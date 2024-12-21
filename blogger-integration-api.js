const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let accessToken = '';
let refreshToken = '';

// Step 1: Redirect to Google OAuth
app.get('/blogger/auth', (req, res) => {
  const state = Math.random().toString(36).substring(7); // CSRF protection
  const url = `https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/blogger&access_type=offline&response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${state}`;
  res.redirect(url);
});

// Step 2: Handle OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
    console.log('Authorization code:', code);

  try {
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log('Access Token:', accessToken);
    console.log('Refresh Token:', refreshToken);

    // res.send('Google authentication successful!');
    res.redirect('https://6a43-103-151-209-126.ngrok-free.app/blogger/blogs');
  } catch (error) {
    console.error('Error exchanging code for token:', error.response.data);
    res.status(500).send('Authentication failed.');
  }
});

// Step 3: Fetch Blogs
app.get('/blogger/blogs', async (req, res) => {
  try {
    const response = await axios.get('https://www.googleapis.com/blogger/v3/users/self/blogs', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching blogs:', error.response.data);
    res.status(500).send('Failed to fetch blogs.');
  }
});

// Step 4: Create a Post
app.post('/blogger/posts', async (req, res) => {
  const { blogId, title, content } = req.body;

  try {
    const response = await axios.post(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`,
      { title, content },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error creating post:', error.response.data);
    res.status(500).send('Failed to create post.');
  }
});

// Step 5: Refresh Access Token
app.get('/blogger/refresh', async (req, res) => {
  try {
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    accessToken = tokenResponse.data.access_token;
    res.send('Access token refreshed successfully.');
  } catch (error) {
    console.error('Error refreshing token:', error.response.data);
    res.status(500).send('Failed to refresh token.');
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));