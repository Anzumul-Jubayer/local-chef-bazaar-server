const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Local Chef Server is running");
});

// MONGO CONNECTION
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.3w2hwbo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: false,
  },
});

async function run() {
  try {
    // await client.connect();
    console.log("MongoDB Connected!");

    const db = client.db("local_chef_db");
    const mealsCollection = db.collection("meals");
    const usersCollection = db.collection("users");
    const reviewsCollection = db.collection("reviews");
    const favoritesCollection = db.collection("favorites");
    const ordersCollection = db.collection("orders");
    const roleRequestsCollection = db.collection("roleRequests");

    // MEALS 
    app.get("/meals", async (req, res) => {
      try {
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
        const meal = req.body;
        const result = await mealsCollection.insertOne(meal);
        res.send({ success: true, data: result });
      } catch (error) {
        res.send({ success: false, message: error.message });
      }
    });

    app.get("/meal-details/:id", async (req, res) => {
      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!meal) return res.status(404).send({ message: "Meal not found" });
        res.send(meal);
      } catch (error) {
        res.status(500).send({ message: "Error fetching meal", error });
      }
    });

    app.get("/meals-by-chef/:email", async (req, res) => {
      try {
        const meals = await mealsCollection.find({ userEmail: req.params.email }).toArray();
        res.send({ success: true, data: meals });
      } catch (err) {
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.delete("/meals/:id", async (req, res) => {
      try {
        const result = await mealsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 1) res.send({ success: true, message: "Meal deleted successfully" });
        else res.status(404).send({ success: false, message: "Meal not found" });
      } catch (err) {
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.put("/meals/:id", async (req, res) => {
      try {
        const result = await mealsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
        if (result.modifiedCount === 1) res.send({ success: true, message: "Meal updated successfully" });
        else res.status(404).send({ success: false, message: "Meal not found" });
      } catch (err) {
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    //  USERS 
    app.post("/users", async (req, res) => {
      try {
        const { name, email, address, password, photoURL, status } = req.body;
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists" });

        const newUser = { name, email, address, password, photoURL, status: status || "active", role: "user" };
        await usersCollection.insertOne(newUser);
        res.status(201).json({ message: "User created successfully", user: newUser });
      } catch (error) {
        res.status(500).json({ message: "Error creating user", error });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json(users);
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch users", error });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) return res.status(404).send({ success: false, message: "User not found" });
        res.send({ success: true, data: user });
      } catch (error) {
        res.status(500).send({ success: false, message: "Server error", error });
      }
    });

    app.patch("/users/:id/fraud", async (req, res) => {
      try {
        const result = await usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "fraud" } });
        if (result.modifiedCount > 0) res.send({ success: true, message: "User marked as fraud" });
        else res.status(404).send({ success: false, message: "User not found" });
      } catch (err) {
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.get("/users/role/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      if (!user) return res.json({ success: false, role: null });
      res.json({ success: true, role: user.role });
    });

    // REVIEWS 
    app.post("/reviews", async (req, res) => {
      try {
        const review = { ...req.body, date: new Date() };
        await reviewsCollection.insertOne(review);
        res.send({ success: true, message: "Review added successfully", data: review });
      } catch (error) {
        res.status(500).send({ success: false, message: "Error adding review", error });
      }
    });

    app.get("/reviews", async (req, res) => {
      try {
        const reviews = await reviewsCollection.find().sort({ date: -1 }).limit(3).toArray();
        res.send({ success: true, data: reviews });
      } catch (error) {
        res.status(500).send({ success: false, message: "Error fetching reviews", error });
      }
    });

    app.get("/reviews/:foodId", async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({ foodId: req.params.foodId }).sort({ date: -1 }).toArray();
        res.send({ success: true, data: reviews });
      } catch (error) {
        res.status(500).send({ success: false, message: "Error fetching reviews", error });
      }
    });

    app.get("/reviews/user/:email", async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({ reviewerEmail: req.params.email }).sort({ date: -1 }).toArray();
        res.send({ success: true, data: reviews });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch reviews", error });
      }
    });

    app.put("/reviews/:id", async (req, res) => {
      try {
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { ...req.body, date: new Date() } }
        );
        if (result.modifiedCount > 0) res.send({ success: true, message: "Review updated successfully" });
        else res.status(404).send({ success: false, message: "Review not found" });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to update review", error });
      }
    });

    app.delete("/reviews/:id", async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount > 0) res.send({ success: true, message: "Review deleted successfully" });
        else res.status(404).send({ success: false, message: "Review not found" });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to delete review", error });
      }
    });

    //  FAVORITES 
    app.post("/favorites", async (req, res) => {
      try {
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
        const data = await favoritesCollection.find({ userEmail: req.params.email }).sort({ addedTime: -1 }).toArray();
        res.send({ success: true, data });
      } catch (error) {
        res.status(500).send({ success: false, message: "Error fetching favorites", error });
      }
    });

    app.delete("/favorites/:id", async (req, res) => {
      try {
        const result = await favoritesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount > 0) res.send({ success: true, message: "Favorite meal removed successfully" });
        else res.status(404).send({ success: false, message: "Favorite meal not found" });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to remove favorite meal", error });
      }
    });

    //  ORDERS 
    app.post("/orders", async (req, res) => {
      try {
        const result = await ordersCollection.insertOne(req.body);
        res.send({ success: true, data: result });
      } catch (error) {
        res.send({ success: false, error });
      }
    });

    app.get("/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.find().toArray();
        res.send({ success: true, data: orders });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch orders", error });
      }
    });

    app.get("/orders/user/:email", async (req, res) => {
      try {
        const orders = await ordersCollection.find({ userEmail: req.params.email }).sort({ orderTime: -1 }).toArray();
        res.send({ success: true, data: orders });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch orders" });
      }
    });

    app.get("/orders-by-chef/:chefId", async (req, res) => {
      try {
        const orders = await ordersCollection.find({ chefId: req.params.chefId }).sort({ orderTime: -1 }).toArray();
        res.send({ success: true, data: orders });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch orders" });
      }
    });

    app.patch("/orders/:id/payment", async (req, res) => {
      try {
        const { paymentInfo } = req.body;
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { paymentStatus: "paid", paymentInfo } }
        );
        if (result.modifiedCount > 0) res.send({ success: true, message: "Payment updated successfully" });
        else res.status(404).send({ success: false, message: "Order not found" });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to update payment" });
      }
    });

    app.patch("/update-order-status/:id", async (req, res) => {
      try {
        const { orderStatus } = req.body;
        if (!orderStatus) return res.json({ success: false, message: "orderStatus is required" });

        const result = await ordersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { orderStatus } });
        if (result.modifiedCount > 0) res.json({ success: true, message: "Order status updated successfully" });
        else res.json({ success: false, message: "Failed to update order" });
      } catch (error) {
        res.json({ success: false, message: "Server error" });
      }
    });

    // ROLE REQUESTS 
    app.post("/role-requests", async (req, res) => {
      try {
        const { userId, userName, userEmail, requestType } = req.body;
        if (!["chef", "admin"].includes(requestType)) return res.status(400).send({ success: false, message: "Invalid request type" });

        const requestData = { userId, userName, userEmail, requestType, requestStatus: "pending", requestTime: new Date() };
        await roleRequestsCollection.insertOne(requestData);
        res.send({ success: true, data: requestData });
      } catch (error) {
        res.status(500).send({ success: false, message: "Server error", error });
      }
    });

    app.get("/role-requests", async (req, res) => {
      try {
        const requests = await roleRequestsCollection.find().sort({ requestTime: -1 }).toArray();
        res.json({ success: true, data: requests });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch requests", error });
      }
    });

    app.patch("/role-requests/:id/accept", async (req, res) => {
      try {
        const { requestType, userEmail } = req.body;
        let updateData = {};
        if (requestType === "chef") updateData = { role: "chef", chefId: "chef-" + Math.floor(1000 + Math.random() * 9000) };
        else if (requestType === "admin") updateData = { role: "admin" };

        await usersCollection.updateOne({ email: userEmail }, { $set: updateData });
        await roleRequestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { requestStatus: "approved" } });

        res.json({ success: true, message: "Request approved successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error });
      }
    });

    app.patch("/role-requests/:id/reject", async (req, res) => {
      try {
        await roleRequestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { requestStatus: "rejected" } });
        res.json({ success: true, message: "Request rejected successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error });
      }
    });

    // STRIPE PAYMENT 
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({ amount, currency: "usd", payment_method_types: ["card"] });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

  } finally {
   
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
