const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let accessToken = ''; // Temporary storage for the access token
let refreshToken = ''; // Temporary storage for the refresh token

// Step 1: Redirect user to Google's OAuth consent screen
app.get('/auth', (req, res) => {
  const oauthUrl = `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=https://www.googleapis.com/auth/business.manage&access_type=offline&prompt=consent`;
  res.redirect(oauthUrl);
});

// Step 2: Handle the OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  console.log('Authorization code:', code);

  try {
    // Exchange authorization code for access and refresh tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log('Access Token:', accessToken);
    console.log('Refresh Token:', refreshToken);

    res.send('OAuth authentication successful! You can now use the API.');
  } catch (error) {
    console.error('Error exchanging code for token:', error.response.data);
    res.status(500).send('Failed to authenticate.');
  }
});

// Step 3: Fetch business accounts
app.get('/accounts', async (req, res) => {
  try {
    const response = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching accounts:', error.response.data);
    res.status(500).send(error);
  }
});

// Step 4: Get all business accounts for a user
app.get('/user-accounts', async (req, res) => {
    try {
        console.log('Access Token:', accessToken);
        const response = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching user accounts:', error.response.data);
        res.status(500).send('Failed to fetch user accounts.');
    }
});

// Step 4: Update business information (example: location name)
app.post('/update-location', async (req, res) => {
  const accountId = 'your-account-id';
  const locationId = 'your-location-id';

  try {
    const response = await axios.patch(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}`,
      {
        locationName: 'Updated Business Name',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error updating location:', error.response.data);
    res.status(500).send('Failed to update location.');
  }
});

// Step 5: Refresh Access Token
app.get('/refresh-token', async (req, res) => {
  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    accessToken = tokenResponse.data.access_token;
    res.send('Access token refreshed successfully!');
  } catch (error) {
    console.error('Error refreshing token:', error.response.data);
    res.status(500).send('Failed to refresh token.');
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));