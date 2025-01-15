const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Environment Variables
const CLIENT_ID = process.env.WORDPRESS_CLIENT_ID;
const CLIENT_SECRET = process.env.WORDPRESS_CLIENT_SECRET;
const REDIRECT_URI = process.env.WORDPRESS_REDIRECT_URI;
let ACCESS_TOKEN = ''; // Store the access token after OAuth

// Step 1: Redirect to WordPress.com OAuth
app.get('/wordpress/auth', (req, res) => {
  const url = `https://public-api.wordpress.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=global`;
  res.redirect(url);
});

// Step 2: Handle OAuth Callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const tokenResponse = await axios.post(
      'https://public-api.wordpress.com/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code: code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    ACCESS_TOKEN = tokenResponse.data.access_token;
    console.log('Access Token:', ACCESS_TOKEN);
    res.send('WordPress authentication successful! You can now fetch site details.');
  } catch (error) {
    console.error('Error during token exchange:', error.response?.data || error.message);
    res.status(500).send('Authentication failed.');
  }
});

// Step 3: Get Site IDs
app.get('/wordpress/sites', async (req, res) => {
  if (!ACCESS_TOKEN) {
    return res.status(401).send('Unauthorized: Please authenticate first.');
  }

  try {
    const response = await axios.get('https://public-api.wordpress.com/rest/v1.1/me/sites', {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
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

  if (!ACCESS_TOKEN) {
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
          Authorization: `Bearer ${ACCESS_TOKEN}`,
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

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));