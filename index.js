const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Vercel-compatible CORS configuration - Allow all origins for production
app.use(cors({
  origin: true, // Allow all origins
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
  socketTimeoutMS: 45000
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
// Additional essential routes for dashboard functionality

// User order statistics
app.get("/orders/user/:email/stats", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const userEmail = req.params.email;
    const orders = await ordersCollection.find({ userEmail }).toArray();
    
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => {
      const amount = order.totalPrice || order.price || order.amount || 0;
      return sum + parseFloat(amount || 0);
    }, 0);
    const pendingOrders = orders.filter(order => 
      order.orderStatus === 'pending' || order.orderStatus === 'processing'
    ).length;
    
    res.send({
      success: true,
      totalOrders,
      totalSpent,
      pendingOrders
    });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch order stats", error: error.message });
  }
});

// Role requests
app.post("/role-requests", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const roleRequestsCollection = database.collection("roleRequests");
    
    const { userId, userName, userEmail, requestType } = req.body;
    if (!["chef", "admin"].includes(requestType)) {
      return res.status(400).send({ success: false, message: "Invalid request type" });
    }

    const requestData = { 
      userId, 
      userName, 
      userEmail, 
      requestType, 
      requestStatus: "pending", 
      requestTime: new Date() 
    };
    await roleRequestsCollection.insertOne(requestData);
    res.send({ success: true, data: requestData });
  } catch (error) {
    res.status(500).send({ success: false, message: "Server error", error });
  }
});

app.get("/role-requests", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const roleRequestsCollection = database.collection("roleRequests");
    
    const requests = await roleRequestsCollection.find().sort({ requestTime: -1 }).toArray();
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch requests", error });
  }
});

// Test routes
app.post("/test-post", (req, res) => {
  res.json({ success: true, message: "POST is working" });
});

app.post("/simple-profile-update/:email", async (req, res) => {
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
// ADMIN DASHBOARD ENDPOINTS

// Get platform statistics
app.get("/admin/stats", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const usersCollection = database.collection("users");
    const ordersCollection = database.collection("orders");
    const mealsCollection = database.collection("meals");
    
    const [users, orders, meals] = await Promise.all([
      usersCollection.find().toArray(),
      ordersCollection.find().toArray(),
      mealsCollection.find().toArray()
    ]);
    
    const totalUsers = users.length;
    const activeChefs = users.filter(user => user.role === 'chef').length;
    const totalOrders = orders.length;
    
    // Calculate total revenue with robust field checking
    const totalRevenue = orders.reduce((sum, order) => {
      let amount = 0;
      
      if (order.paymentInfo && order.paymentInfo.amount) {
        amount = parseFloat(order.paymentInfo.amount) / 100;
      } else if (order.totalPrice) {
        amount = parseFloat(order.totalPrice);
      } else if (order.price && order.quantity) {
        amount = parseFloat(order.price) * parseFloat(order.quantity);
      } else if (order.price) {
        amount = parseFloat(order.price);
      } else if (order.amount) {
        amount = parseFloat(order.amount);
      } else if (order.paymentAmount) {
        amount = parseFloat(order.paymentAmount);
      }
      
      return sum + (amount || 0);
    }, 0);
    
    const totalMeals = meals.length;
    const completedOrders = orders.filter(order => order.orderStatus === 'delivered').length;
    const pendingOrders = orders.filter(order => order.orderStatus === 'pending').length;
    const cancelledOrders = orders.filter(order => order.orderStatus === 'cancelled').length;
    
    res.send({
      success: true,
      metrics: {
        totalUsers,
        activeChefs,
        totalOrders,
        totalRevenue,
        totalMeals,
        completedOrders,
        pendingOrders,
        cancelledOrders
      },
      trends: {
        users: Math.floor(Math.random() * 20) - 10,
        chefs: Math.floor(Math.random() * 15) - 7,
        orders: Math.floor(Math.random() * 25) - 12,
        revenue: Math.floor(Math.random() * 30) - 15,
        meals: Math.floor(Math.random() * 10) - 5,
        completion: Math.floor(Math.random() * 15) - 7,
        growth: Math.floor(Math.random() * 20) - 10
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).send({ success: false, message: "Failed to fetch admin stats", error: error.message });
  }
});

// Get platform monthly data
app.get("/admin/monthly-data", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const orders = await ordersCollection.find().toArray();
    
    const monthlyData = {};
    orders.forEach(order => {
      const date = new Date(order.orderTime || order.orderDate || order.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthName,
          orders: 0,
          revenue: 0,
          users: new Set()
        };
      }
      
      monthlyData[monthKey].orders += 1;
      
      let amount = 0;
      if (order.paymentInfo && order.paymentInfo.amount) {
        amount = parseFloat(order.paymentInfo.amount) / 100;
      } else if (order.totalPrice) {
        amount = parseFloat(order.totalPrice);
      } else if (order.price && order.quantity) {
        amount = parseFloat(order.price) * parseFloat(order.quantity);
      } else if (order.price) {
        amount = parseFloat(order.price);
      } else if (order.amount) {
        amount = parseFloat(order.amount);
      } else if (order.paymentAmount) {
        amount = parseFloat(order.paymentAmount);
      }
      
      monthlyData[monthKey].revenue += (amount || 0);
      monthlyData[monthKey].users.add(order.userEmail);
    });
    
    const result = Object.values(monthlyData).map(data => ({
      month: data.month,
      orders: data.orders,
      revenue: data.revenue,
      users: data.users.size
    })).sort((a, b) => new Date(a.month) - new Date(b.month));
    
    res.send({ success: true, data: result });
  } catch (error) {
    console.error('Monthly data error:', error);
    res.status(500).send({ success: false, message: "Failed to fetch monthly data", error: error.message });
  }
});

// Get platform order status distribution
app.get("/admin/order-status-distribution", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const orders = await ordersCollection.find().toArray();
    
    const statusCounts = {};
    orders.forEach(order => {
      const status = order.orderStatus || 'pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    const result = Object.entries(statusCounts).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      status: status
    }));
    
    res.send({ success: true, data: result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch status distribution" });
  }
});

// DEBUG: Get sample order data to check payment fields
app.get("/debug/orders-sample", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const orders = await ordersCollection.find().limit(5).toArray();
    const totalRevenue = orders.reduce((sum, order) => {
      const amount = order.totalPrice || 
                    order.price || 
                    order.amount || 
                    order.paymentAmount || 
                    (order.paymentInfo && order.paymentInfo.amount) ||
                    (order.quantity && order.price ? order.quantity * order.price : 0) ||
                    0;
      return sum + parseFloat(amount || 0);
    }, 0);
    
    res.send({ 
      success: true, 
      sampleOrders: orders,
      totalRevenue,
      orderCount: orders.length,
      message: "Sample orders for debugging payment calculation"
    });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch sample orders", error: error.message });
  }
});

// USER DASHBOARD ADDITIONAL ENDPOINTS

// Get user monthly order data
app.get("/orders/user/:email/monthly", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const userEmail = req.params.email;
    const orders = await ordersCollection.find({ userEmail }).toArray();
    
    const monthlyData = {};
    orders.forEach(order => {
      const date = new Date(order.orderTime || order.orderDate || order.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthName,
          orders: 0,
          spending: 0
        };
      }
      
      monthlyData[monthKey].orders += 1;
      
      const amount = order.totalPrice || 
                    order.price || 
                    order.amount || 
                    order.paymentAmount || 
                    (order.paymentInfo && order.paymentInfo.amount) ||
                    (order.quantity && order.price ? order.quantity * order.price : 0) ||
                    0;
      monthlyData[monthKey].spending += parseFloat(amount || 0);
    });
    
    const result = Object.values(monthlyData).sort((a, b) => {
      return new Date(a.month) - new Date(b.month);
    });
    
    res.send({ success: true, data: result });
  } catch (error) {
    console.error('Monthly data error:', error);
    res.status(500).send({ success: false, message: "Failed to fetch monthly data", error: error.message });
  }
});

// Get spending trend data
app.get("/orders/user/:email/spending-trend", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const userEmail = req.params.email;
    const orders = await ordersCollection.find({ userEmail }).toArray();
    
    const spendingData = {};
    orders.forEach(order => {
      const date = new Date(order.orderTime || order.orderDate || order.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      if (!spendingData[monthKey]) {
        spendingData[monthKey] = {
          month: monthName,
          spending: 0
        };
      }
      
      const amount = order.totalPrice || 
                    order.price || 
                    order.amount || 
                    order.paymentAmount || 
                    (order.paymentInfo && order.paymentInfo.amount) ||
                    (order.quantity && order.price ? order.quantity * order.price : 0) ||
                    0;
      spendingData[monthKey].spending += parseFloat(amount || 0);
    });
    
    const result = Object.values(spendingData).sort((a, b) => {
      return new Date(a.month + ' 2024') - new Date(b.month + ' 2024');
    });
    
    res.send({ success: true, data: result });
  } catch (error) {
    console.error('Spending trend error:', error);
    res.status(500).send({ success: false, message: "Failed to fetch spending trend", error: error.message });
  }
});

// Get order status distribution
app.get("/orders/user/:email/status-distribution", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const userEmail = req.params.email;
    const orders = await ordersCollection.find({ userEmail }).toArray();
    
    const statusCounts = {};
    orders.forEach(order => {
      const status = order.orderStatus || 'pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    const result = Object.entries(statusCounts).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      status: status
    }));
    
    res.send({ success: true, data: result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch status distribution" });
  }
});

// Get recent orders
app.get("/orders/user/:email/recent", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const ordersCollection = database.collection("orders");
    
    const userEmail = req.params.email;
    const limit = parseInt(req.query.limit) || 5;
    
    const orders = await ordersCollection
      .find({ userEmail })
      .sort({ orderTime: -1 })
      .limit(limit)
      .toArray();
    
    res.send({ success: true, data: orders });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch recent orders" });
  }
});

// Get user favorites (enhanced)
app.get("/favorites/user/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const favoritesCollection = database.collection("favorites");
    
    const userEmail = req.params.email;
    const favorites = await favoritesCollection.find({ userEmail }).sort({ addedTime: -1 }).toArray();
    res.send({ success: true, favorites: favorites });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch favorites" });
  }
});

// CHEF DASHBOARD ENDPOINTS

// Get chef statistics
app.get("/chef/:email/stats", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    const ordersCollection = database.collection("orders");
    
    const chefEmail = req.params.email;
    
    // Get chef's meals
    const chefMeals = await mealsCollection.find({ userEmail: chefEmail }).toArray();
    const totalMeals = chefMeals.length;
    
    // Get orders for chef's meals
    const chefMealIds = chefMeals.map(meal => meal._id.toString());
    const orders = await ordersCollection.find({ 
      $or: [
        { chefId: chefEmail },
        { chefEmail: chefEmail },
        { foodId: { $in: chefMealIds } }
      ]
    }).toArray();
    
    const totalOrders = orders.length;
    const completedOrders = orders.filter(order => order.orderStatus === 'delivered' || order.orderStatus === 'completed').length;
    const pendingOrders = orders.filter(order => order.orderStatus === 'pending' || order.orderStatus === 'processing').length;
    
    // Calculate total revenue with robust field checking
    const totalRevenue = orders.reduce((sum, order) => {
      let amount = 0;
      
      if (order.paymentInfo && order.paymentInfo.amount) {
        amount = parseFloat(order.paymentInfo.amount) / 100;
      } else if (order.totalPrice) {
        amount = parseFloat(order.totalPrice);
      } else if (order.totalAmount) {
        amount = parseFloat(order.totalAmount);
      } else if (order.price && order.quantity) {
        amount = parseFloat(order.price) * parseFloat(order.quantity);
      } else if (order.price) {
        amount = parseFloat(order.price);
      } else if (order.amount) {
        amount = parseFloat(order.amount);
      } else if (order.paymentAmount) {
        amount = parseFloat(order.paymentAmount);
      }
      
      return sum + (amount || 0);
    }, 0);
    
    // Calculate average rating
    const avgRating = chefMeals.length > 0 
      ? chefMeals.reduce((sum, meal) => sum + (parseFloat(meal.rating) || 0), 0) / chefMeals.length 
      : 0;
    
    res.send({
      success: true,
      stats: {
        totalMeals,
        totalOrders,
        completedOrders,
        pendingOrders,
        totalRevenue,
        avgRating: Math.round(avgRating * 10) / 10
      },
      trends: {
        meals: Math.floor(Math.random() * 20) - 10,
        orders: Math.floor(Math.random() * 25) - 12,
        revenue: Math.floor(Math.random() * 30) - 15,
        rating: Math.floor(Math.random() * 10) - 5
      }
    });
  } catch (error) {
    console.error('Chef stats error:', error);
    res.status(500).send({ success: false, message: "Failed to fetch chef stats", error: error.message });
  }
});

// Get chef monthly data
app.get("/chef/:email/monthly-data", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    const ordersCollection = database.collection("orders");
    
    const chefEmail = req.params.email;
    
    // Get chef's meals
    const chefMeals = await mealsCollection.find({ userEmail: chefEmail }).toArray();
    const chefMealIds = chefMeals.map(meal => meal._id.toString());
    
    // Get orders for chef's meals
    const orders = await ordersCollection.find({ 
      $or: [
        { chefId: chefEmail },
        { chefEmail: chefEmail },
        { foodId: { $in: chefMealIds } }
      ]
    }).toArray();
    
    const monthlyData = {};
    orders.forEach(order => {
      const date = new Date(order.orderTime || order.orderDate || order.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthName,
          orders: 0,
          revenue: 0
        };
      }
      
      monthlyData[monthKey].orders += 1;
      
      let amount = 0;
      if (order.paymentInfo && order.paymentInfo.amount) {
        amount = parseFloat(order.paymentInfo.amount) / 100;
      } else if (order.totalPrice) {
        amount = parseFloat(order.totalPrice);
      } else if (order.totalAmount) {
        amount = parseFloat(order.totalAmount);
      } else if (order.price && order.quantity) {
        amount = parseFloat(order.price) * parseFloat(order.quantity);
      } else if (order.price) {
        amount = parseFloat(order.price);
      } else if (order.amount) {
        amount = parseFloat(order.amount);
      } else if (order.paymentAmount) {
        amount = parseFloat(order.paymentAmount);
      }
      
      monthlyData[monthKey].revenue += (amount || 0);
    });
    
    const result = Object.values(monthlyData).sort((a, b) => {
      return new Date(a.month) - new Date(b.month);
    });
    
    res.send({ success: true, data: result });
  } catch (error) {
    console.error('Chef monthly data error:', error);
    res.status(500).send({ success: false, message: "Failed to fetch chef monthly data", error: error.message });
  }
});

// Get chef order status distribution
app.get("/chef/:email/order-status-distribution", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    const ordersCollection = database.collection("orders");
    
    const chefEmail = req.params.email;
    
    // Get chef's meals
    const chefMeals = await mealsCollection.find({ userEmail: chefEmail }).toArray();
    const chefMealIds = chefMeals.map(meal => meal._id.toString());
    
    // Get orders for chef's meals
    const orders = await ordersCollection.find({ 
      $or: [
        { chefId: chefEmail },
        { chefEmail: chefEmail },
        { foodId: { $in: chefMealIds } }
      ]
    }).toArray();
    
    const statusCounts = {};
    orders.forEach(order => {
      const status = order.orderStatus || 'pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    const result = Object.entries(statusCounts).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      status: status
    }));
    
    res.send({ success: true, data: result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch chef order status distribution" });
  }
});

// Get chef recent orders
app.get("/chef/:email/recent-orders", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    const ordersCollection = database.collection("orders");
    
    const chefEmail = req.params.email;
    const limit = parseInt(req.query.limit) || 5;
    
    // Get chef's meals
    const chefMeals = await mealsCollection.find({ userEmail: chefEmail }).toArray();
    const chefMealIds = chefMeals.map(meal => meal._id.toString());
    
    // Get recent orders for chef's meals
    const orders = await ordersCollection
      .find({ 
        $or: [
          { chefId: chefEmail },
          { chefEmail: chefEmail },
          { foodId: { $in: chefMealIds } }
        ]
      })
      .sort({ orderTime: -1 })
      .limit(limit)
      .toArray();
    
    res.send({ success: true, data: orders });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch chef recent orders" });
  }
});

// Get chef meal performance
app.get("/chef/:email/meal-performance", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const mealsCollection = database.collection("meals");
    const ordersCollection = database.collection("orders");
    
    const chefEmail = req.params.email;
    
    // Get chef's meals
    const chefMeals = await mealsCollection.find({ userEmail: chefEmail }).toArray();
    
    // Get order counts for each meal
    const mealPerformance = await Promise.all(
      chefMeals.map(async (meal) => {
        const orderCount = await ordersCollection.countDocuments({ 
          $or: [
            { foodId: meal._id.toString() },
            { mealName: meal.foodName }
          ]
        });
        
        return {
          mealId: meal._id,
          mealName: meal.foodName,
          rating: meal.rating || 0,
          price: meal.price || 0,
          orders: orderCount,
          image: meal.image
        };
      })
    );
    
    // Sort by order count
    mealPerformance.sort((a, b) => b.orders - a.orders);
    
    res.send({ success: true, data: mealPerformance });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch chef meal performance" });
  }
});
// Get user reviews
app.get("/reviews/user/:email", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const reviewsCollection = database.collection("reviews");
    
    const userEmail = req.params.email;
    const reviews = await reviewsCollection.find({ reviewerEmail: userEmail }).sort({ date: -1 }).toArray();
    res.send({ success: true, data: reviews });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch user reviews", error: error.message });
  }
});

// Update user review
app.put("/reviews/:id", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const reviewsCollection = database.collection("reviews");
    
    const reviewId = req.params.id;
    const updateData = { ...req.body, updatedAt: new Date() };
    
    const result = await reviewsCollection.updateOne(
      { _id: new ObjectId(reviewId) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Review not found" });
    }
    
    res.send({ success: true, message: "Review updated successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to update review", error: error.message });
  }
});

// Delete user review
app.delete("/reviews/:id", async (req, res) => {
  try {
    const database = await ensureDbConnection();
    const reviewsCollection = database.collection("reviews");
    
    const reviewId = req.params.id;
    const result = await reviewsCollection.deleteOne({ _id: new ObjectId(reviewId) });
    
    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Review not found" });
    }
    
    res.send({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to delete review", error: error.message });
  }
});