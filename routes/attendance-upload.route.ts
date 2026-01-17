import express from "express";
import { Request, Response } from "express";
import { prisma } from "../utils/prismaClient.ts";
import { extractAttendanceReport } from "../utils/gemini.ts";
import { matchSubjectFromReport } from "../utils/attendance-helper.ts";
import upload from "../utils/multer.ts";
import cloudinary from "../utils/cloudinary.ts";

const router = express.Router();

// Upload attendance report and sync records
// POST /api/v1/attendance/upload-report
const uploadMiddleware = (req: Request, res: Response, next: any) => {
    upload.single("file")(req, res, (err: any) => {
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

router.post("/upload-report", uploadMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        console.log("Received upload request inside handler");

        if (!req.file) {
            console.error("No file received by multer");
            res.status(400).send({ error: "No file uploaded" });
            return;
        }

        console.log("File received:", req.file.path, req.file.originalname, req.file.mimetype);

        const userId = req.body?.userId;
        if (!userId) {
            console.error("No userId provided");
            res.status(400).send({ error: "User ID is required" });
            return;
        }

        console.log("Processing attendance report for user:", userId);

        // Upload PDF to Cloudinary
        console.log("Starting Cloudinary upload...");
        const uploadResult = await new Promise<{ secure_url: string }>(
            (resolve, reject) => {
                cloudinary.uploader.upload(
                    req.file!.path,
                    {
                        folder: "hyphen/attendance-reports",
                        resource_type: "auto"
                    },
                    (err, result) => {
                        if (err) {
                            console.error("Cloudinary upload failed:", err);
                            reject(err);
                        } else {
                            console.log("Cloudinary upload success:", result);
                            resolve(result as { secure_url: string });
                        }
                    }
                );
            }
        );

        const reportUrl = uploadResult.secure_url;
        console.log("Uploaded report to Cloudinary:", reportUrl);

        // Extract data from PDF using Gemini
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

        // Get user's timetable and batch
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

        // Process records
        const results = {
            processed: 0,
            created: 0,
            duplicates: 0,
            filtered: 0,
            unmatched: [] as string[],
        };

        for (const record of reportData.records) {
            // Filter by batch
            if (record.batch !== "All" && record.batch !== userBatch && userBatch !== "All") {
                results.filtered++;
                continue;
            }

            // Match subject
            const matchedSubject = await matchSubjectFromReport(
                record.courseName,
                record.type,
                timetable.subjects
            );

            if (!matchedSubject) {
                results.unmatched.push(record.courseCode);
                continue;
            }

            // Check for duplicate
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

            // Create attendance record
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

        // Update subject attendance counters
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
    } catch (err: any) {
        console.error("Error uploading attendance report:", err);
        // Return detailed error to frontend
        res.status(500).send({
            error: "Failed to process report",
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

export default router;
