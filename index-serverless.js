const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Vercel-compatible CORS configuration
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174", 
    "http://localhost:3000",
    "https://local-chef-bazar-a-11.netlify.app",
    "https://local-chef-bazaar-a-11.netlify.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-requested-with"],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Middleware for parsing JSON and URL-encoded data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'LocalChefBazaar API Server is running!', 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Database connection with connection pooling for serverless
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.3w2hwbo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: false,
  },
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0,
  bufferCommands: false,
});

// Global database connection
let db;
let isConnected = false;

// Serverless-compatible database connection
async function ensureDbConnection() {
  if (!isConnected || !db) {
    try {
      await client.connect();
      db = client.db("local_chef_db");
      isConnected = true;
      console.log("MongoDB Connected!");
      return db;
    } catch (error) {
      console.error("MongoDB connection error:", error);
      isConnected = false;
      throw error;
    }
  }
  return db;
}

// MEALS ROUTES
app.get("/meals", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortOrder = req.query.sort === "desc" ? -1 : 1;
    const deliveryArea = req.query.area;
    const search = req.query.search;

    const filter = {};
    if (deliveryArea) filter.deliveryArea = { $regex: deliveryArea, $options: "i" };
    if (search) filter.foodName = { $regex: search, $options: "i" };

    const totalMeals = await mealsCollection.countDocuments(filter);
    const meals = await mealsCollection.find(filter).sort({ price: sortOrder }).skip(skip).limit(limit).toArray();

    res.send({
      success: true,
      total: totalMeals,
      page,
      limit,
      totalPages: Math.ceil(totalMeals / limit),
      data: meals,
    });
  } catch (error) {
    res.status(500).send({ message: "Error fetching meals", error });
  }
});

app.post("/meals", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    
    const meal = req.body;
    const result = await mealsCollection.insertOne(meal);
    res.send({ success: true, data: result });
  } catch (error) {
    res.send({ success: false, message: error.message });
  }
});

app.get("/meal-details/:id", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    
    const meal = await mealsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!meal) return res.status(404).send({ message: "Meal not found" });
    res.send(meal);
  } catch (error) {
    res.status(500).send({ message: "Error fetching meal", error });
  }
});

app.get("/meals-by-chef/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    
    const meals = await mealsCollection.find({ userEmail: req.params.email }).toArray();
    res.send({ success: true, data: meals });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error" });
  }
});

app.delete("/meals/:id", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    
    const result = await mealsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 1) res.send({ success: true, message: "Meal deleted successfully" });
    else res.status(404).send({ success: false, message: "Meal not found" });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error" });
  }
});

app.put("/meals/:id", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    
    const result = await mealsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
    if (result.modifiedCount === 1) res.send({ success: true, message: "Meal updated successfully" });
    else res.status(404).send({ success: false, message: "Meal not found" });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error" });
  }
});

// USERS ROUTES
app.post("/users", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const usersCollection = database.collection("users");
    
    const { name, email, address, password, photoURL, status, isUpdate, ...otherFields } = req.body;
    
    if (isUpdate) {
      const updateData = { name, address, photoURL, ...otherFields };
      
      if (req.body.newPassword && req.body.currentPassword) {
        updateData.password = req.body.newPassword;
      }
      
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      updateData.updatedAt = new Date();
      
      const result = await usersCollection.updateOne(
        { email },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      const updatedUser = await usersCollection.findOne(
        { email },
        { projection: { password: 0 } }
      );
      
      return res.json({ 
        success: true, 
        message: "Profile updated successfully",
        data: updatedUser
      });
    }
    
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const newUser = { name, email, address, password, photoURL, status: status || "active", role: "user" };
    await usersCollection.insertOne(newUser);
    res.status(201).json({ message: "User created successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Error processing request", error });
  }
});

app.get("/users", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const usersCollection = database.collection("users");
    
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch users", error });
  }
});

app.get("/users/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const usersCollection = database.collection("users");
    
    const user = await usersCollection.findOne({ email: req.params.email });
    if (!user) return res.status(404).send({ success: false, message: "User not found" });
    res.send({ success: true, data: user });
  } catch (error) {
    res.status(500).send({ success: false, message: "Server error", error });
  }
});

app.get("/users/role/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const usersCollection = database.collection("users");
    
    const user = await usersCollection.findOne({ email: req.params.email });
    if (!user) return res.json({ success: false, role: null });
    res.json({ success: true, role: user.role });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// Profile update endpoints
app.post("/profile-update/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const usersCollection = database.collection("users");
    
    const email = req.params.email;
    const updateData = { ...req.body };
    
    delete updateData._id;
    delete updateData.role;
    updateData.updatedAt = new Date();
    
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
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
});

// REVIEWS ROUTES
app.post("/reviews", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const reviewsCollection = database.collection("reviews");
    
    const review = { ...req.body, date: new Date() };
    await reviewsCollection.insertOne(review);
    res.send({ success: true, message: "Review added successfully", data: review });
  } catch (error) {
    res.status(500).send({ success: false, message: "Error adding review", error });
  }
});

app.get("/reviews", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const reviewsCollection = database.collection("reviews");
    
    const reviews = await reviewsCollection.find().sort({ date: -1 }).limit(3).toArray();
    res.send({ success: true, data: reviews });
  } catch (error) {
    res.status(500).send({ success: false, message: "Error fetching reviews", error });
  }
});

app.get("/reviews/:foodId", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const reviewsCollection = database.collection("reviews");
    
    const reviews = await reviewsCollection.find({ foodId: req.params.foodId }).sort({ date: -1 }).toArray();
    res.send({ success: true, data: reviews });
  } catch (error) {
    res.status(500).send({ success: false, message: "Error fetching reviews", error });
  }
});

// FAVORITES ROUTES
app.post("/favorites", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const favoritesCollection = database.collection("favorites");
    
    const fav = req.body;
    const exists = await favoritesCollection.findOne({ userEmail: fav.userEmail, mealId: fav.mealId });
    if (exists) return res.send({ success: false, message: "Already added to favorites" });
    fav.addedTime = new Date();
    await favoritesCollection.insertOne(fav);
    res.send({ success: true, message: "Added to favorites successfully", data: fav });
  } catch (error) {
    res.status(500).send({ success: false, message: "Error adding to favorites", error });
  }
});

app.get("/favorites/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const favoritesCollection = database.collection("favorites");
    
    const data = await favoritesCollection.find({ userEmail: req.params.email }).sort({ addedTime: -1 }).toArray();
    res.send({ success: true, data });
  } catch (error) {
    res.status(500).send({ success: false, message: "Error fetching favorites", error });
  }
});

// ORDERS ROUTES
app.post("/orders", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const result = await ordersCollection.insertOne(req.body);
    res.send({ success: true, data: result });
  } catch (error) {
    res.send({ success: false, error });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const orders = await ordersCollection.find().toArray();
    res.send({ success: true, data: orders });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch orders", error });
  }
});

app.get("/orders/user/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const orders = await ordersCollection.find({ userEmail: req.params.email }).sort({ orderTime: -1 }).toArray();
    res.send({ success: true, data: orders });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch orders" });
  }
});

// STRIPE PAYMENT
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({ 
      amount, 
      currency: "usd", 
      payment_method_types: ["card"] 
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const server = app.listen(port, () => {
    console.log(`🚀 LocalChefBazaar API Server running on port: ${port}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
      if (client) {
        client.close();
      }
    });
  });
}

// Export for Vercel serverless functions
module.exports = app;