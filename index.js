const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Local Chef server is running");
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
    // client connect
    await client.connect();
    console.log("MongoDB Connected!");

    const db = client.db("local_chef_db");
    const mealsCollection = db.collection("meals");
    const usersCollection = db.collection("users");
    const reviewsCollection = db.collection("reviews");
    const favoritesCollection = db.collection("favorites");

    // get all meals
    app.get("/meals", async (req, res) => {
      try {
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;
        let skip = (page - 1) * limit;

        let sortOrder = req.query.sort === "desc" ? -1 : 1;
        let deliveryArea = req.query.area;
        let search = req.query.search;

        let filter = {};

        if (deliveryArea) {
          filter.deliveryArea = { $regex: deliveryArea, $options: "i" };
        }

        if (search) {
          filter.foodName = { $regex: search, $options: "i" };
        }

        const totalMeals = await mealsCollection.countDocuments(filter);

        const meals = await mealsCollection
          .find(filter)
          .sort({ price: sortOrder })
          .skip(skip)
          .limit(limit)
          .toArray();

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

    // meal details page

    app.get("/meal-details/:id", async (req, res) => {
      const id = req.params.id;
      const { ObjectId } = require("mongodb");

      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }

        res.send(meal);
      } catch (error) {
        res.status(500).send({ message: "Error fetching meal", error });
      }
    });
    //  users
    app.post("/users", async (req, res) => {
      try {
        const { name, email, address, password, photoURL, status } = req.body;

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const newUser = {
          name,
          email,
          address,
          password,
          photoURL,
          status: status || "active",
        };
        await usersCollection.insertOne(newUser);

        res
          .status(201)
          .json({ message: "User created successfully", user: newUser });
      } catch (error) {
        res.status(500).json({ message: "Error creating user", error });
      }
    });

    // Add Review
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body;
        review.date = new Date();

        const result = await reviewsCollection.insertOne(review);

        res.send({
          success: true,
          message: "Review added successfully",
          data: review,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Error adding review", error });
      }
    });

    // Get Reviews

    app.get("/reviews/:foodId", async (req, res) => {
      try {
        const foodId = req.params.foodId;

        const reviews = await reviewsCollection
          .find({ foodId })
          .sort({ date: -1 })
          .toArray();

        res.send({
          success: true,
          data: reviews,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Error fetching reviews", error });
      }
    });
     
    //  Add to Favorites
   
    app.post("/favorites", async (req, res) => {
      try {
        const fav = req.body;

        // check if already exists
        const exists = await favoritesCollection.findOne({
          userEmail: fav.userEmail,
          mealId: fav.mealId,
        });

        if (exists) {
          return res.send({
            success: false,
            message: "Already added to favorites",
          });
        }

        fav.addedTime = new Date();

        const result = await favoritesCollection.insertOne(fav);

        res.send({
          success: true,
          message: "Added to favorites successfully",
          data: fav,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Error adding to favorites",
          error,
        });
      }
    });
    

    
    // Get  Favorites
 
    app.get("/favorites/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const data = await favoritesCollection
          .find({ userEmail: email })
          .sort({ addedTime: -1 })
          .toArray();

        res.send({
          success: true,
          data,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Error fetching favorites",
          error,
        });
      }
    });
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
