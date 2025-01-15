// app.js

const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.CLIENT_ID; // Ensure this is set in your .env file
const CLIENT_SECRET = process.env.CLIENT_SECRET; // Ensure this is set in your .env file
const REDIRECT_URI = process.env.REDIRECT_URI; // Ensure this is set in your .env file

const TOKEN_PATH = path.join(__dirname, 'tokens.json'); // Path to the token storage file
let accessToken = ''; // Temporary storage for the access token
let refreshToken = ''; // Temporary storage for the refresh token

// Load tokens from a file if they exist
if (fs.existsSync(TOKEN_PATH)) {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
}

// Add this function after the token loading code
async function refreshAccessToken() {
  try {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    console.log('Refreshing token...');
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    if (!response.data.access_token) {
      throw new Error('No access token received from refresh token request');
    }

    accessToken = response.data.access_token;
    
    // Update the tokens file with new access token
    const tokens = {
      access_token: accessToken,
      refresh_token: refreshToken, // Keep the existing refresh token
    };
    
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Token refreshed successfully');

    return accessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error.response?.data || error);
    // If refresh token is invalid, we should clear the tokens and redirect to auth
    if (error.response?.data?.error === 'invalid_grant') {
      fs.unlinkSync(TOKEN_PATH);
      accessToken = '';
      refreshToken = '';
    }
    throw error;
  }
}

// Add a wrapper function for API calls
async function makeAuthenticatedRequest(requestFn) {
  try {
    return await requestFn();
  } catch (error) {
    if (error.response?.status === 401 || error.response?.data?.error?.status === 'UNAUTHENTICATED') {
      console.log('Token expired, refreshing...');
      await refreshAccessToken();
      return await requestFn(); // Retry with new token
    }
    throw error;
  }
}

// Add this middleware to handle token refresh
async function authenticateRequest(req, res, next) {
  try {
    if (!accessToken) {
      throw new Error('No access token available');
    }
    next();
  } catch (error) {
    (res.status === 401 || res.status === 500) ?? await refreshAccessToken();
    res.status(401).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
}

// Function to create a new location
async function createLocation(location, accountId) {
  
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?requestId=${location.storeCode}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    const data = {
      title: location.businessName,
      languageCode: 'en-US',
      phoneNumbers: {
        primaryPhone: location.phoneNumber,
      },
      "categories": {
        "primaryCategory": {
            "name": "gcid:software_company",
        }
      },
      storefrontAddress: {
        addressLines: [location.address],
        locality: location.city,
        administrativeArea: location.state,
        postalCode: location.zip,
        regionCode: 'US',
      },
      // Add latlng coordinates
      latlng: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      storeCode: location.storeCode,
    };
  
    try {
      const response = await axios.post(url, data, { headers });
      console.log('Location created:', response.data);
    } catch (error) {
      console.error('Error creating location:', error.response);
    }
  }
  
  // Function to automate the creation of multiple locations
  async function automateCitations(businessData, accountId) {
    for (const location of businessData.locations) {
      await createLocation({
        ...location,
        businessName: businessData.businessName,
        phoneNumber: businessData.phoneNumber,
      }, accountId);
    }
  }

// Step 1: Redirect user to Google's OAuth consent screen
app.get('/', (req, res) => {
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

    // Save tokens to a JSON file
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
    }));

    console.log('Access Token:', accessToken);
    console.log('Refresh Token:', refreshToken);

    res.send('OAuth authentication successful! You can now use the API.');
  } catch (error) {
    console.error('Error exchanging code for token:', error.response.data);
    res.status(500).send('Failed to authenticate.');
  }
});

// Step 3: Fetch business accounts
app.get('/accounts', authenticateRequest, async (req, res) => {
  try {
    const fetchAccounts = async () => {
      const responseAccounts = await axios.get(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const accountId = responseAccounts.data.accounts[0].name.split('/')[1];
      console.log('Account ID:', accountId);

      const responseLocations = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            pageSize: 10,
            readMask: 'name,title,phoneNumbers'
          }
        }
      );

      return {
        accounts: responseAccounts.data,
        locations: responseLocations.data
      };
    };

    const result = await makeAuthenticatedRequest(fetchAccounts);

    // Save the data to files
    fs.writeFileSync('accounts.json', JSON.stringify(result.accounts, null, 2));
    fs.writeFileSync('locations.json', JSON.stringify(result.locations, null, 2));

    res.json(result);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      error: 'Failed to fetch accounts',
      details: error.response?.data?.error || error.message
    });
  }
});

// Step 4: add new business locations
app.get('/automate', authenticateRequest, async (req, res) => {
    const accountId = JSON.parse(fs.readFileSync('accounts.json', 'utf8')).accounts[0].name.split('/')[1];
    const businessData = {
      businessName: 'ADA Assist',
      phoneNumber: '(866) 880-2754',
      locations: [
        {
            address: '123 Main St',
            city: 'San Diego',
            state: 'CA',
            zip: '92101',
            storeCode: 'LOC1',
            // Add coordinates for San Diego location 1
            latitude: 32.715736,
            longitude: -117.161087
          }
      ],
    };
  
    try {
      await automateCitations(businessData, accountId);
      res.send('Citations automated successfully.');
    } catch (error) {
      console.error('Error automating citations:', error);
      res.status(500).send('Failed to automate citations.');
    }
  });

// Add this new endpoint after the /automate endpoint
app.get('/locations', authenticateRequest, async (req, res) => {
  try {
    const accountId = JSON.parse(fs.readFileSync('accounts.json', 'utf8')).accounts[0].name.split('/')[1];
    
    // Get locations with store codes LOC1 and LOC2
    const response = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          readMask: 'name,title,storefrontAddress,phoneNumbers,storeCode,latlng',
          filter: 'storeCode="LOC1" OR storeCode="LOC2"'
        }
      }
    );



    if (!response.data.locations || response.data.locations.length === 0) {
      return res.status(404).json({ message: 'No locations found with the specified store codes' });
    }

    res.json({
      message: 'Locations retrieved successfully',
      locations: response.data.locations
    });

  } catch (error) {
    console.error('Error fetching locations:', error.response?.data?.error || error);
    res.status(500).json({
      error: 'Failed to fetch locations',
      details: error.response?.data?.error || error.message
    });
  }
});

// get location by location id
app.get('/location', authenticateRequest, async (req, res) => {
  const locationId = '13243869801957368846';
  const accountId = '117719187792093398189';
  const location = await axios.get(`https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations/${locationId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  res.json(location);
});

// Step 6: Create a new business location
app.post('/create-location', authenticateRequest, async (req, res) => {
  try {
    const createNewLocation = async () => {
      const accountId = JSON.parse(fs.readFileSync('accounts.json', 'utf8')).accounts[0].name.split('/')[1];
      const requestId = `loc_${Date.now()}`;  // Make requestId unique

      const locationData = {
        languageCode: "en",
        title: 'ADA Assist',
        storefrontAddress: {
          regionCode: 'US',
          languageCode: 'en',
          addressLines: ['123 Main St'],
          locality: 'San Diego',
          administrativeArea: 'CA',
          postalCode: '92101'
        },
        phoneNumbers: {
          primaryPhone: '(866) 880-2754'
        },
        categories: {
          primaryCategory: {
            name: "gcid:software_company"
          }
        },
        storeCode: requestId,
        websiteUri: 'https://ada-assist.com',
        regularHours: {
          periods: [
            {
              openDay: "MONDAY",
              openTime: { hours: 9, minutes: 0 },
              closeDay: "MONDAY",
              closeTime: { hours: 17, minutes: 0 }
            },
            {
              openDay: "TUESDAY",
              openTime: { hours: 9, minutes: 0 },
              closeDay: "TUESDAY",
              closeTime: { hours: 17, minutes: 0 }
            },
            {
              openDay: "WEDNESDAY",
              openTime: { hours: 9, minutes: 0 },
              closeDay: "WEDNESDAY",
              closeTime: { hours: 17, minutes: 0 }
            },
            {
              openDay: "THURSDAY",
              openTime: { hours: 9, minutes: 0 },
              closeDay: "THURSDAY",
              closeTime: { hours: 17, minutes: 0 }
            },
            {
              openDay: "FRIDAY",
              openTime: { hours: 9, minutes: 0 },
              closeDay: "FRIDAY",
              closeTime: { hours: 17, minutes: 0 }
            }
          ]
        },
        serviceArea: {
          businessType: "CUSTOMER_AND_BUSINESS_LOCATION",
          places: {
            placeInfos: [{
              placeName: "San Diego, CA, USA"
            }]
          },
          regionCode: "US"
        },
        latlng: {
          latitude: 32.715736,
          longitude: -117.161087
        }
      };

      // Wrap the actual API call in retryWithBackoff
      return await retryWithBackoff(async () => {
        const response = await axios.post(
          `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
          locationData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            params: {
              requestId: requestId,
              validateOnly: false
            },
          }
        );
        return response.data;
      });
    };

    // Use makeAuthenticatedRequest with the new retry logic
    const location = await makeAuthenticatedRequest(createNewLocation);

    res.json({
      message: 'Location created successfully',
      location: location
    });

  } catch (error) {
    console.error('Error creating business location:', error.response?.data || error);
    res.status(error.response?.status || 500).json({
      error: 'Failed to create business location',
      details: error.response?.data?.error || error.message,
      retryAfter: error.response?.headers['retry-after']
    });
  }
});

// Add this new endpoint to get business listings
app.get('/business-listings', authenticateRequest, async (req, res) => {
  try {
    const getBusinessListings = async () => {
      // First get the account ID
      const accountsResponse = await axios.get(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        }
      );

      if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
        throw new Error('No business accounts found');
      }

      const accountId = accountsResponse.data.accounts[0].name.split('/')[1];

      // Then get all locations for this account
      const locationsResponse = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            pageSize: 100,
            readMask: 'name,title,storefrontAddress,phoneNumbers,categories,websiteUri,regularHours,specialHours,serviceArea,labels,profile,metadata,latlng'
          }
        }
      );

      return {
        account: accountsResponse.data.accounts[0],
        locations: locationsResponse.data.locations || [],
      };
    };

    const result = await makeAuthenticatedRequest(getBusinessListings);

    // Save the latest data to files
    fs.writeFileSync('accounts.json', JSON.stringify({ accounts: [result.account] }, null, 2));
    fs.writeFileSync('locations.json', JSON.stringify({ locations: result.locations }, null, 2));

    res.json({
      message: 'Business listings retrieved successfully',
      account: result.account,
      locations: result.locations,
      totalLocations: result.locations.length
    });

  } catch (error) {
    console.error('Error fetching business listings:', error);
    res.status(500).json({
      error: 'Failed to fetch business listings',
      details: error.response?.data?.error || error.message
    });
  }
});

// Rewrite of sync-locations-to-maps endpoint
app.post('/sync-locations-to-maps', authenticateRequest, async (req, res) => {
  try {
    // 1. Function to fetch business account & locations
    const fetchAllLocations = async () => {
      // Fetch account
      const accountsResp = await axios.get(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      if (!accountsResp.data.accounts?.length) {
        throw new Error('No Google Business accounts found');
      }
      const accountId = accountsResp.data.accounts[0].name.split('/')[1];

      // Fetch up to 100 existing locations
      const locationsResp = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            pageSize: 100,
            readMask: 'name,title,storefrontAddress,phoneNumbers,categories,websiteUri,regularHours,specialHours,serviceArea,labels,profile,metadata,latlng'
          }
        }
      );

      return {
        accountId,
        locations: locationsResp.data.locations || []
      };
    };

    // 2. Retrieve all locations
    const { accountId, locations } = await makeAuthenticatedRequest(fetchAllLocations);

    // 3. Iterate over locations, verifying if no placeId is present
    const results = [];
    for (const location of locations) {
      const hasPlaceId = Boolean(location.metadata?.placeId);

      // Skipped if placeId is present
      if (hasPlaceId) {
        results.push({
          locationName: location.name,
          status: 'skipped',
          message: 'Already on Google Maps (has placeId)',
          placeId: location.metadata.placeId
        });
        continue;
      }

      console.log('Location:', location);

      try {
        // a. Fetch verification options
        const verificationOptionsFn = async () => {
          const locationName = location.name.split('/').pop();
          console.log('Location Name:', locationName);
          const resp = await axios.post(
            `https://mybusinessverifications.googleapis.com/v1/${locationName}:fetchVerificationOptions`,
            { languageCode: 'en-US' },  // BCP-47 format
            {
              headers: { Authorization: `Bearer ${accessToken}` }
            }
          );
          return resp.data;
        };
        const { methods = [] } = await makeAuthenticatedRequest(verificationOptionsFn);
        console.log('Verification methods:', methods);

        // b. Attempt verification with the first method found
        const verifyFn = async () => {
          const verificationMethod = methods[0] || 'PHONE';
          const resp = await axios.post(
            `https://mybusinessverifications.googleapis.com/v1/${location.name}:verify`,
            {
              languageCode: 'en-US',
              method: verificationMethod
            },
            {
              headers: { Authorization: `Bearer ${accessToken}` }
            }
          );
          return { method: verificationMethod, data: resp.data };
        };
        const verificationResult = await makeAuthenticatedRequest(verifyFn);

        // c. Patch the location with required fields
        const patchLocationFn = async () => {
          const patchResp = await axios.patch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${location.name}`,
            {
              // Must specify fields we want to change
              languageCode: 'en-US',
              locationName: location.locationName || 'Placeholder Name',
              storefrontAddress: location.storefrontAddress,
              phoneNumbers: location.phoneNumbers,
              websiteUri: location.websiteUri || 'https://ada-assist.com',
              latlng: location.latlng,
              // Example profile & serviceArea usage
              profile: location.profile || {
                description: 'Default description if none is set.'
              },
              serviceArea: location.serviceArea || {
                businessType: 'CUSTOMER_AND_BUSINESS_LOCATION'
              },
              regularHours: location.regularHours
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              params: {
                // Must list all fields we want changed
                updateMask:
                  'languageCode,locationName,storefrontAddress,phoneNumbers,' +
                  'websiteUri,latlng,profile,serviceArea,regularHours',
                validateOnly: false
              }
            }
          );
          return patchResp.data;
        };
        const patchResult = await makeAuthenticatedRequest(patchLocationFn);

        results.push({
          locationName: location.name,
          status: 'success',
          verificationMethod: verificationResult.method,
          verificationResponse: verificationResult.data,
          patchResponse: patchResult
        });

      } catch (err) {
        console.error('Verification/Patching error:', err.response?.data?.error || err.message);
        results.push({
          locationName: location.name,
          status: 'error',
          error: err.response?.data?.error || err.message
        });
      }
    }

    // 4. Summarize results
    res.json({
      message: 'Location sync to Maps completed',
      summary: {
        totalLocations: locations.length,
        successCount: results.filter(r => r.status === 'success').length,
        skippedCount: results.filter(r => r.status === 'skipped').length,
        errorCount: results.filter(r => r.status === 'error').length
      },
      results
    });

  } catch (error) {
    console.error('Error in sync-locations-to-maps:', error);
    res.status(500).json({
      error: 'Failed syncing locations to Maps',
      details: error.response?.data?.error || error.message
    });
  }
});

// Add this new endpoint to delete all locations
app.delete('/locations', authenticateRequest, async (req, res) => {
  try {
    const deleteAllLocations = async () => {
      // First get all locations
      const accountsResponse = await axios.get(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        }
      );

      if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
        throw new Error('No business accounts found');
      }

      const accountId = accountsResponse.data.accounts[0].name.split('/')[1];
      console.log('Account ID:', accountId);

      // Get all locations with pagination
      let allLocations = [];
      let pageToken = '';
      
      do {
        const locationsResponse = await axios.get(
          `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params: {
              pageSize: 100,  // Maximum page size
              pageToken: pageToken || undefined,
              readMask: 'name,title'  // Include title for better logging
            }
          }
        );

        const locations = locationsResponse.data.locations || [];
        allLocations = allLocations.concat(locations);
        
        // Get next page token
        pageToken = locationsResponse.data.nextPageToken;
        
        console.log(`Fetched ${locations.length} locations. Total so far: ${allLocations.length}`);
        
        // If there are more pages, wait a bit to avoid rate limiting
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } while (pageToken);

      console.log(`Total locations found: ${allLocations.length}`);

      const deleteResults = [];

      // Delete each location
      for (const location of allLocations) {
        try {
          await axios.delete(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${location.name}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              }
            }
          );

          deleteResults.push({
            locationName: location.name,
            locationTitle: location.title,
            status: 'success'
          });
          
          console.log(`Successfully deleted location: ${location.title} (${location.name})`);
          
        } catch (error) {
          console.error(`Error deleting location ${location.name}:`, error.response?.data || error);
          deleteResults.push({
            locationName: location.name,
            locationTitle: location.title,
            status: 'error',
            error: error.response?.data?.error || error.message
          });
        }

        // Add a small delay between deletions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return {
        totalLocations: allLocations.length,
        deleteResults
      };
    };

    // Execute the deletion with authentication handling
    const result = await makeAuthenticatedRequest(deleteAllLocations);

    // Update the local JSON files
    fs.writeFileSync('locations.json', JSON.stringify({ locations: [] }, null, 2));

    res.json({
      message: 'Location deletion completed',
      summary: {
        totalLocations: result.totalLocations,
        successfulDeletions: result.deleteResults.filter(r => r.status === 'success').length,
        failedDeletions: result.deleteResults.filter(r => r.status === 'error').length
      },
      details: result.deleteResults
    });

  } catch (error) {
    console.error('Error deleting locations:', error);
    res.status(500).json({
      error: 'Failed to delete locations',
      details: error.response?.data?.error || error.message
    });
  }
});

// Add this utility function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Add retry wrapper function
async function retryWithBackoff(operation, maxRetries = 5) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (error.response?.status === 503) {
        retries++;
        if (retries === maxRetries) {
          throw error;
        }
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const waitTime = Math.pow(2, retries - 1) * 1000;
        console.log(`Attempt ${retries} failed. Retrying in ${waitTime}ms...`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
}

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
