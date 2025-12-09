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

    
  } finally {
   
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
