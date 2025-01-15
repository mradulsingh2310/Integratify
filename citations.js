const express = require('express');
const fs = require('fs');
const csvParser = require('csv-parser');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware for JSON parsing
app.use(bodyParser.json());

// Load the CSV file
const locations = [];
const filePath = './google-citation-sitemap-template.csv'; // Update with your file path

// Read and parse CSV into memory
fs.createReadStream(filePath)
  .pipe(csvParser())
  .on('data', (row) => {
    locations.push({
      ...row,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
    });
  })
  .on('end', () => {
    console.log('CSV file successfully loaded.');
  });

// Helper function to calculate distance using Haversine formula
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Radius of Earth in kilometers
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

// Helper function to enhance company names with keywords
const enhanceCompanyName = (company) => {
  const keywords = [
    'Professional',
    'Top-rated',
    'Expert',
    'Certified',
    'Affordable',
    'Reliable',
    'Trusted',
    'Leading',
    'Local',
    'Specialist',
  ];
  return `${company} - ${keywords.join(', ')}`;
};

// API to generate citations for a company with nearby zip codes
app.post('/generate-citations', (req, res) => {
  const { company, state, zip } = req.body;

  // Validate input
  if (!company || !state || !zip) {
    return res
      .status(400)
      .json({ message: 'Please provide company, state, and zip.' });
  }

  // Find the given zip's coordinates
  const targetLocation = locations.find(
    (loc) => loc.state_name.toLowerCase() === state.toLowerCase() && loc.zip === zip
  );

  if (!targetLocation) {
    return res.status(404).json({ message: 'Zip code not found in the dataset.' });
  }

  const { lat: targetLat, lng: targetLng } = targetLocation;

  // Calculate distances from the target zip to all other locations
  const nearbyLocations = locations
    .map((loc) => ({
      ...loc,
      distance: calculateDistance(targetLat, targetLng, loc.lat, loc.lng),
    }))
    .sort((a, b) => a.distance - b.distance) // Sort by distance
    .slice(0, 100); // Take the nearest 100 locations

  // Generate citations
  const enhancedCompany = enhanceCompanyName(company);
  const citations = nearbyLocations.map((loc) => ({
    company: enhancedCompany,
    location: `${loc.city}, ${loc.state_name}, ${loc.zip}`,
    county: loc.county_name,
    lat: loc.lat,
    lng: loc.lng,
    distance: loc.distance.toFixed(2) + ' km', // Include distance for reference
  }));

  res.json({ citations });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});