require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors()); // Allow frontend to access backend

const PORT = 3001; // Runs on localhost:3001

// API Key Endpoint (Never expose the actual key in frontend)
app.get("/api/key", (req, res) => {
    res.json({ key: process.env.YOUTUBE_API_KEY });
});

// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
