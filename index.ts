import http from "http";
import express, { Response } from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors, { CorsOptions } from "cors";
import rateLimit from "express-rate-limit";

dotenv.config();

// Importing Routes ----------------------------------------------------------------------------------------------

import userRouter from "./routes/user.route.ts";
import timetableRouter from "./routes/timetable.route.ts";
import attendanceRouter from "./routes/attendance.route.ts";

// Initializing Server -------------------------------------------------------------------------------------------

const app = express();
let server = http.createServer(app);

// Using Middleware -------------------------------------------------------------------------------------------

// Whitelist for trusted domains
const whitelist = ["http://localhost:3000", "https://quizzer-ai.vercel.app"];

// Function to deny access to domains except those in whitelist.
const corsOptions: CorsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Find request domain and check in whitelist.
    if (origin && whitelist.indexOf(origin) !== -1) {
      // Accept request
      callback(null, true);
    } else {
      // Send CORS error.
      callback(new Error("Not allowed by CORS"));
    }
  },
};

// Limit each IP to 60 requests per minute
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});

// Rate Limit
app.use(limiter);
// Parses request body.
app.use(express.urlencoded({ extended: true }));
// Add security to server.
app.use(helmet());
// Removes the "X-Powered-By" HTTP header from Express responses.
app.disable("x-powered-by");
// Parses JSON passed inside body.
app.use(express.json());
// Enable CORS
app.use(cors(corsOptions));

// Routes -------------------------------------------------------------------------------------------

// Default route to check if server is working.
app.get("/api/v1", (_, res: Response) => {
  res.status(200).send("We are good to go!");
});


// Routes -----------------------------------------------------------------------------------------

// Auth Routes
app.use("/api/v1/user", userRouter);
// Timetable Routes
app.use("/api/v1/timetable", timetableRouter);
// Attendance Routes
app.use("/api/v1/attendance", attendanceRouter);


// Listening on PORT -------------------------------------------------------------------------------------------

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});