// Import dependencies
const express = require('express');
const bodyParser = require('body-parser');

// Initialize the app
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// Sample JSON data
const jsonData = {
    "heading": "",
    "subtext": "Bulk Schedule, Local Posts, and more!",
    "last_updated": "2025-01-02"
};

// Routes
// Get JSON data
app.get('/data', (req, res) => {
    res.json(jsonData);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
