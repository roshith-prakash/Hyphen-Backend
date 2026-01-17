import express from "express";
import { prisma } from "../utils/prismaClient.js";
import { extractAttendanceReport } from "../utils/gemini.js";
import { matchSubjectFromReport } from "../utils/attendance-helper.js";
import upload from "../utils/multer.js";
import cloudinary from "../utils/cloudinary.js";
const router = express.Router();
const uploadMiddleware = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            console.error("Multer upload error:", err);
            return res.status(400).send({
                error: "File upload failed",
                details: err.message
            });
        }
        next();
    });
};
router.post("/upload-report", uploadMiddleware, async (req, res) => {
    var _a;
    try {
        console.log("Received upload request inside handler");
        if (!req.file) {
            console.error("No file received by multer");
            res.status(400).send({ error: "No file uploaded" });
            return;
        }
        console.log("File received:", req.file.path, req.file.originalname, req.file.mimetype);
        const userId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            console.error("No userId provided");
            res.status(400).send({ error: "User ID is required" });
            return;
        }
        console.log("Processing attendance report for user:", userId);
        console.log("Starting Cloudinary upload...");
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload(req.file.path, {
                folder: "hyphen/attendance-reports",
                resource_type: "auto"
            }, (err, result) => {
                if (err) {
                    console.error("Cloudinary upload failed:", err);
                    reject(err);
                }
                else {
                    console.log("Cloudinary upload success:", result);
                    resolve(result);
                }
            });
        });
        const reportUrl = uploadResult.secure_url;
        console.log("Uploaded report to Cloudinary:", reportUrl);
        console.log("Starting Gemini extraction...");
        const reportData = await extractAttendanceReport(reportUrl);
        console.log("Gemini extraction raw result:", JSON.stringify(reportData, null, 2));
        if (!reportData || !reportData.records || !Array.isArray(reportData.records)) {
            console.error("Invalid report data structure:", reportData);
            res.status(400).send({
                error: "Failed to extract valid data from report",
                details: "The AI could not identify attendance records in this document. Please ensure it is a valid attendance report."
            });
            return;
        }
        console.log(`Extracted ${reportData.records.length} records from report`);
        const timetable = await prisma.timetable.findFirst({
            where: { userId, isActive: true },
            include: { subjects: true },
        });
        if (!timetable) {
            res.status(404).send({ error: "No active timetable found" });
            return;
        }
        const userBatch = timetable.userBatch || "All";
        console.log("User batch:", userBatch);
        const results = {
            processed: 0,
            created: 0,
            duplicates: 0,
            filtered: 0,
            unmatched: [],
        };
        for (const record of reportData.records) {
            if (record.batch !== "All" && record.batch !== userBatch && userBatch !== "All") {
                results.filtered++;
                continue;
            }
            const matchedSubject = await matchSubjectFromReport(record.courseName, record.type, timetable.subjects);
            if (!matchedSubject) {
                results.unmatched.push(record.courseCode);
                continue;
            }
            const attendanceDate = new Date(record.date);
            attendanceDate.setHours(0, 0, 0, 0);
            const existing = await prisma.dailyAttendance.findFirst({
                where: {
                    userId,
                    subjectId: matchedSubject.id,
                    date: attendanceDate,
                    timeStart: record.startTime,
                },
            });
            if (existing) {
                results.duplicates++;
                continue;
            }
            await prisma.dailyAttendance.create({
                data: {
                    userId,
                    subjectId: matchedSubject.id,
                    date: attendanceDate,
                    timeStart: record.startTime,
                    timeEnd: record.endTime,
                    subjectName: matchedSubject.name,
                    subjectType: matchedSubject.type,
                    status: record.status,
                },
            });
            results.created++;
        }
        results.processed = results.created + results.duplicates;
        console.log("Processing complete:", results);
        for (const subject of timetable.subjects) {
            const weight = subject.weight || 1.0;
            const allRecords = await prisma.dailyAttendance.findMany({
                where: { subjectId: subject.id },
            });
            const totalHeld = allRecords
                .filter((r) => r.status !== "not-conducted")
                .reduce((sum) => sum + weight, 0);
            const attended = allRecords
                .filter((r) => r.status === "present")
                .reduce((sum) => sum + weight, 0);
            await prisma.subject.update({
                where: { id: subject.id },
                data: { attended, totalHeld },
            });
        }
        res.status(200).send({
            success: true,
            results,
            reportInfo: {
                studentName: reportData.studentName,
                duration: reportData.duration,
            },
        });
    }
    catch (err) {
        console.error("Error uploading attendance report:", err);
        res.status(500).send({
            error: "Failed to process report",
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});
export default router;
