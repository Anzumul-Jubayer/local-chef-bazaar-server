const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = 3001; // Different port to avoid conflicts

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.3w2hwbo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: false,
  },
});

// Test route
app.get("/", (req, res) => {
  res.send("Test server is running");
});

// Simple profile update
app.post("/profile-update/:email", async (req, res) => {
  console.log('Profile update called for:', req.params.email);
  console.log('Body:', req.body);
  
  try {
    const email = req.params.email;
    const updateData = { ...req.body };
    
    delete updateData._id;
    delete updateData.role;
    updateData.updatedAt = new Date();
    
    await client.connect();
    const db = client.db("local_chef_db");
    const usersCollection = db.collection("users");
    
    const result = await usersCollection.updateOne(
      { email: email },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    const updatedUser = await usersCollection.findOne(
      { email: email },
      { projection: { password: 0 } }
    );
    
    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
});

// Get user by email
app.get("/users/:email", async (req, res) => {
  console.log('Get user called for:', req.params.email);
  
  try {
    const email = req.params.email;
    
    await client.connect();
    const db = client.db("local_chef_db");
    const usersCollection = db.collection("users");
    
    const user = await usersCollection.findOne(
      { email: email },
      { projection: { password: 0 } }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    res.json({ success: true, data: user });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Test server running on port: ${port}`);
});