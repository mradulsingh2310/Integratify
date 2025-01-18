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

// Step 1: Fetch account ID for the logged-in user
app.get('/account-id', async (req, res) => {
  try {
    const response = await axios.get('https://mybusiness.googleapis.com/v4/accounts', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Assuming the first account is the one we want
    const accountId = response.data.accounts[0].name.split('/')[1]; // Extracting account ID from the name
    res.json({ accountId });
  } catch (error) {
    console.error('Error fetching account ID:', error.response.data);
    res.status(500).send('Failed to fetch account ID.');
  }
});

// Step 2: Get business locations using the account ID
app.get('/business-locations', async (req, res) => {
  try {
    const accountId = '117719187792093398189'; // Get account ID from query parameters
    const pageSize = 10; // Optional: number of locations to fetch per page
    const readMask = 'name,title,phoneNumbers'; // Specify the fields you want to retrieve

    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?pageSize=${pageSize}&readMask=${readMask}`;
    
    console.log('Fetching business locations for account ID:', accountId); // Log account ID
    console.log('Requesting URL:', url); // Log the full URL

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching business locations:', error);
    res.status(500).send('Failed to fetch business locations.');
  }
});

// Step 3: Update business information (NAP details)
app.patch('/update-business-info', async (req, res) => {
  const {name, address, phoneNumber } = {name: 'ADA Assist', address: '123 Main St, Anytown, USA', phoneNumber: '(866) 880-2754'}; // Expecting these details in the request body
  const locationId = '13236245616427686330';
  try {
    const response = await axios.patch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}`,
      {
        locationName: name,
        address: {
          addressLines: [address], // Adjust based on the address format
        },
        primaryPhone: phoneNumber,
      },
      {
        headers: {
          Authorization: `Bearer ya29.a0ARW5m75XGxA-0LiyW3RJmaOhgZNh_CglQkzdN3NEYDBqap1r6GH7xcDmk3d1hs2u2zjUChUwRlvemdnWLIC7cvxEQE0Hw3elyKtDKRCOnXxDtSo73XM_tlE_9eycl9tFPgl3_TLb6Jd5BWE4CGiq-MBsA0_2AZ-oOsbZRD1GaCgYKAYMSARISFQHGX2MiNsubv1Q6jwftgn0V0b3e6g0175`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error updating business information:', error.response ? error.response.data : error.message);
    res.status(500).send('Failed to update business information.');
  }
});

// Step 4: Create a new business location (publish citation)
app.post('/create-business-location', async (req, res) => {
  const {name, address, phoneNumber } = {name: 'ADA Assist', address: '123 Main St, Anytown, USA', phoneNumber: '(866) 880-2754'}; // Expecting these details in the request body // Expecting these details in the request body
  const accountId = '117719187792093398189';
  try {
    const response = await axios.post(
      `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
      {
        title: name,
        address: {
          addressLines: [address], // Adjust based on the address format
        },
        primaryPhone: phoneNumber,
        // Add any other required fields here
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
    console.error('Error creating business location:', error.response.data.error.details[0].fieldViolations);
    res.status(500).send('Failed to create business location.');
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));