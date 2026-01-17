import http from "http";
import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
dotenv.config();
import userRouter from "./routes/user.route.js";
import timetableRouter from "./routes/timetable.route.js";
import attendanceRouter from "./routes/attendance.route.js";
import aiGuidanceRouter from "./routes/ai-guidance.route.js";
const app = express();
let server = http.createServer(app);
const whitelist = ["http://localhost:3000", "https://quizzer-ai.vercel.app"];
const corsOptions = {
    origin: function (origin, callback) {
        if (origin && whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            callback(new Error("Not allowed by CORS"));
        }
    },
};
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
});
app.use(limiter);
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.disable("x-powered-by");
app.use(express.json());
app.use(cors(corsOptions));
app.get("/api/v1", (_, res) => {
    res.status(200).send("We are good to go!");
});
app.use("/api/v1/user", userRouter);
app.use("/api/v1/timetable", timetableRouter);
app.use("/api/v1/attendance", attendanceRouter);
app.use("/api/v1/ai-guidance", aiGuidanceRouter);
server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
