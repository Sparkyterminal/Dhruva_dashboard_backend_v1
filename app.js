const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4010;
const { ensureConnected } = require('./lib/mongo');
const morgan = require("morgan");
const helmet = require("helmet");
const path = require("path");
const cors = require("cors");

// Cron job moved to Lambda: functions/cleanupAssets.js (EventBridge schedule)
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!isLambda) {
  const cron = require('node-cron');
  const fs = require("fs");
  cron.schedule('01 01 * * *', () => {
    const empty_these_directories = ["assets/temp_resources", "assets/images", "assets/documents"];
    empty_these_directories.forEach((directory) => {
      fs.readdir(directory, (err, files) => {
        if (err) return;
        for (const file of files || []) {
          fs.unlink(path.join(directory, file), () => {});
        }
      });
    });
  });
}

app.use(cors());

app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

app.use(morgan("dev"));

// Lambda: API Gateway can pass body in a way Express's parser misses - parse manually
if (isLambda) {
  app.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (req.method !== 'GET' && req.method !== 'HEAD' && ct.includes('application/json')) {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        } catch {
          req.body = {};
        }
        next();
      });
      req.on('error', next);
    } else {
      next();
    }
  });
}
// Skip express.json for Lambda JSON requests (already parsed above)
app.use((req, res, next) => {
  if (isLambda && req.body !== undefined && (req.headers['content-type'] || '').includes('application/json')) {
    return next();
  }
  express.json({ limit: '2048mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '2048mb' }));


const API_ROOT ='/api/' 
app.use(`${API_ROOT}assets`, express.static(path.join(__dirname, "assets")));
app.disable('etag');

// Lightweight health-check endpoint for keep-warm pings and uptime monitors
app.get(`${API_ROOT}health`, (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const departmentRoutes = require("./Routes/department");
const userRoutes = require("./Routes/User");
const counterRoutes = require("./Routes/counter");
const requestRoutes = require("./Routes/request");
const vendorRoutes = require("./Routes/Vendor");
const events = require("./Routes/ClientsBookings");
const bills = require("./Routes/Bills");
const checklistRoutes = require("./Routes/checklist");
const eventNamesRoutes = require("./Routes/events");
const eventTypesRoutes = require("./Routes/eventTypes");
const coordinatorsRoutes = require("./Routes/Coordinators");
const venueRoutes = require("./Routes/Venue");
const subVenueLocationRoutes = require("./Routes/SubVenueLocation");
const budgetReportRoutes = require("./Routes/BudgetReport");
const clientLeadRoutes = require("./Routes/ClientLead");
const daybookRoutes = require("./Routes/daybook");


app.use(`${API_ROOT}department`, departmentRoutes);
app.use(`${API_ROOT}user`, userRoutes);
app.use(`${API_ROOT}counter`, counterRoutes);
app.use(`${API_ROOT}request`, requestRoutes);
app.use(`${API_ROOT}vendor`, vendorRoutes);
app.use(`${API_ROOT}events`, events);
app.use(`${API_ROOT}bills`, bills);
app.use(`${API_ROOT}checklist`, checklistRoutes);
app.use(`${API_ROOT}event-names`, eventNamesRoutes);
app.use(`${API_ROOT}event-types`, eventTypesRoutes);
app.use(`${API_ROOT}coordinators`, coordinatorsRoutes);
app.use(`${API_ROOT}venue`, venueRoutes);
app.use(`${API_ROOT}sub-venue-location`, subVenueLocationRoutes);
app.use(`${API_ROOT}budget-report`, budgetReportRoutes);
app.use(`${API_ROOT}client-leads`, clientLeadRoutes);
app.use(`${API_ROOT}daybook`, daybookRoutes);







app.get('/', (req, res) => {
  res.send('Hello from Node.js backend!');
});

// Local server: connect before listening. Lambda connects in handler.js before each API invoke.
if (!isLambda) {
  ensureConnected()
    .then(() => {
      const port = process.env.PORT || PORT;
      app.listen(port, () => console.log(`Server is running on port ${port}`));
    })
    .catch((err) => {
      console.error('Error in connecting to DB:', err.message);
      process.exit(1);
    });
}

module.exports = app;