const axios = require('axios');

// Helper function to generate response
const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Access-Control-Allow-Origin': '*', // Configure this based on your needs
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body)
});

exports.handler = async (event) => {
    // Handle different OAuth flow steps based on the path
    const path = event.path;
    const queryParams = event.queryStringParameters || {};
    
    try {
        switch (path) {
            case '/init-auth':
                // Step 1: Initialize OAuth flow
                let state = Math.random().toString(36).substring(7);
                const clientRedirectUri = queryParams.clientRedirectUri;
                
                // Store state and clientRedirectUri in temporary storage (e.g., DynamoDB)
                // ... storage logic here ...
                
                const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
                    `scope=https://www.googleapis.com/auth/blogger&` +
                    `access_type=offline&` +
                    `response_type=code&` +
                    `client_id=${process.env.CLIENT_ID}&` +
                    `redirect_uri=${process.env.LAMBDA_REDIRECT_URI}&` + // Your Lambda's callback URL
                    `state=${state}`;
                
                return createResponse(200, { authUrl });

            case '/oauth/callback':
                // Step 2: Handle Google's OAuth callback
                const { code } = queryParams;
                state = queryParams.state;
                
                // Verify state and get stored clientRedirectUri
                // ... verification logic here ...
                
                // Exchange code for tokens
                const tokenResponse = await axios.post(
                    'https://oauth2.googleapis.com/token',
                    new URLSearchParams({
                        client_id: process.env.CLIENT_ID,
                        client_secret: process.env.CLIENT_SECRET,
                        code: code,
                        grant_type: 'authorization_code',
                        redirect_uri: process.env.LAMBDA_REDIRECT_URI,
                    }),
                    { 
                        headers: { 
                            'Content-Type': 'application/x-www-form-urlencoded' 
                        } 
                    }
                );

                const { access_token, refresh_token } = tokenResponse.data;
                
                // Redirect back to client with tokens
                const clientRedirectUrl = `${clientRedirectUri}?` +
                    `access_token=${access_token}&` +
                    `refresh_token=${refresh_token}`;
                
                return createResponse(302, {
                    Location: clientRedirectUrl
                });

            case '/refresh-token':
                // Step 3: Handle token refresh
                const { refresh_token: refreshToken } = JSON.parse(event.body);
                
                const refreshResponse = await axios.post(
                    'https://oauth2.googleapis.com/token',
                    new URLSearchParams({
                        client_id: process.env.CLIENT_ID,
                        client_secret: process.env.CLIENT_SECRET,
                        refresh_token: refreshToken,
                        grant_type: 'refresh_token',
                    }),
                    { 
                        headers: { 
                            'Content-Type': 'application/x-www-form-urlencoded' 
                        } 
                    }
                );

                return createResponse(200, {
                    access_token: refreshResponse.data.access_token
                });

            default:
                return createResponse(404, { error: 'Not Found' });
        }
    } catch (error) {
        console.error('Error:', error);
        return createResponse(500, {
            error: 'Internal Server Error',
            details: error.message
        });
    }
};
