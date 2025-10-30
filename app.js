const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4010;
const mongoose = require("mongoose");
const morgan = require("morgan");
const helmet = require("helmet");
const path = require("path");
const cors = require("cors");
const cron = require('node-cron');
const fs = require("fs");




cron.schedule('01 01 * * *', () => {
    const empty_these_directories = [
        "assets/temp_resources",
        "assets/images",
        "assets/documents",
        // "assets/dis_reports",
    ]
    
    empty_these_directories.map((directory) => {
        fs.readdir(directory, (err, files) => {
            if (err) throw err;
    
            for (const file of files) {
                fs.unlink(path.join(directory, file), (err) => {
                    if (err) throw err;
                });
            }
        });
    });
});

app.use(cors());

app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

app.use(morgan("dev"));
app.use(express.json({ limit: '2048mb' }));
app.use(express.urlencoded({ extended: true, limit: '2048mb' }));


const API_ROOT ='/' 
app.use(`${API_ROOT}assets`, express.static(path.join(__dirname, "assets")));
app.disable('etag');

const departmentRoutes = require("./Routes/department");
const userRoutes = require("./Routes/User");
const counterRoutes = require("./Routes/counter");
const requestRoutes = require("./Routes/request");
const vendorRoutes = require("./Routes/Vendor");
const events = require("./Routes/ClientsBookings");


app.use(`${API_ROOT}department`, departmentRoutes);
app.use(`${API_ROOT}user`, userRoutes);
app.use(`${API_ROOT}counter`, counterRoutes);
app.use(`${API_ROOT}request`, requestRoutes);
app.use(`${API_ROOT}vendor`, vendorRoutes);
app.use(`${API_ROOT}events`, events);







app.get('/', (req, res) => {
    res.send('Hello from Node.js backend!');
  });
  
  
  
  // Database connection
  try {
    const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/dashboard";
    const DB_PORT = process.env.PORT || PORT;

    mongoose.connect(DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => {
            console.log("DB Connection Successful");
            app.listen(DB_PORT, () => {
                console.log(`Server is running on port ${DB_PORT}`);
            });
        })
        .catch(err => {
            console.error("Error in connecting to DB:", err);
        });
} catch (error) {
      console.log("Error in connecting to DB:", error);
  }
  