import express from "express";
import { prisma } from "../utils/prismaClient.js";
const router = express.Router();
router.post("/mark", async (req, res) => {
    try {
        const { userId, subjectId, date, timeStart, timeEnd, subjectName, subjectType, status } = req.body;
        if (!userId || !subjectId || !date || !timeStart || !status) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        const attendanceDate = new Date(date);
        attendanceDate.setHours(0, 0, 0, 0);
        const dailyAttendance = await prisma.dailyAttendance.upsert({
            where: {
                userId_subjectId_date_timeStart: {
                    userId,
                    subjectId,
                    date: attendanceDate,
                    timeStart,
                },
            },
            update: {
                status,
                updatedAt: new Date(),
            },
            create: {
                userId,
                subjectId,
                date: attendanceDate,
                timeStart,
                timeEnd: timeEnd || "",
                subjectName: subjectName || "",
                subjectType: subjectType || "Lecture",
                status,
            },
        });
        const allRecords = await prisma.dailyAttendance.findMany({
            where: { subjectId },
        });
        const totalHeld = allRecords.filter((r) => r.status === "present" || r.status === "absent").length;
        const attended = allRecords.filter((r) => r.status === "present").length;
        await prisma.subject.update({
            where: { id: subjectId },
            data: { attended, totalHeld },
        });
        const updatedSubject = await prisma.subject.findUnique({
            where: { id: subjectId },
        });
        res.status(200).send({
            success: true,
            dailyAttendance,
            subject: updatedSubject,
        });
    }
    catch (err) {
        console.error("Error marking attendance:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
});
router.post("/date", async (req, res) => {
    try {
        const { userId, date } = req.body;
        if (!userId || !date) {
            res.status(400).send({ error: "userId and date are required" });
            return;
        }
        const attendanceDate = new Date(date);
        attendanceDate.setHours(0, 0, 0, 0);
        const endOfDay = new Date(attendanceDate);
        endOfDay.setHours(23, 59, 59, 999);
        const records = await prisma.dailyAttendance.findMany({
            where: {
                userId,
                date: {
                    gte: attendanceDate,
                    lte: endOfDay,
                },
            },
            orderBy: { timeStart: "asc" },
        });
        res.status(200).send({
            success: true,
            date: attendanceDate,
            records,
        });
    }
    catch (err) {
        console.error("Error fetching attendance:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
});
router.post("/history", async (req, res) => {
    try {
        const { userId, limit = 30 } = req.body;
        if (!userId) {
            res.status(400).send({ error: "userId is required" });
            return;
        }
        const records = await prisma.dailyAttendance.findMany({
            where: { userId },
            orderBy: { date: "desc" },
            take: limit * 10,
        });
        const byDate = {};
        for (const record of records) {
            const dateKey = record.date.toISOString().split("T")[0];
            if (!byDate[dateKey]) {
                byDate[dateKey] = [];
            }
            byDate[dateKey].push(record);
        }
        const dates = Object.keys(byDate)
            .sort((a, b) => b.localeCompare(a))
            .slice(0, limit);
        const history = dates.map((dateKey) => ({
            date: dateKey,
            records: byDate[dateKey],
            present: byDate[dateKey].filter((r) => r.status === "present").length,
            absent: byDate[dateKey].filter((r) => r.status === "absent").length,
        }));
        res.status(200).send({
            success: true,
            history,
        });
    }
    catch (err) {
        console.error("Error fetching history:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
});
router.post("/update", async (req, res) => {
    try {
        const { subjectId, attended, totalHeld } = req.body;
        if (!subjectId) {
            res.status(400).send({ error: "Subject ID is required" });
            return;
        }
        const subject = await prisma.subject.update({
            where: { id: subjectId },
            data: {
                attended: attended,
                totalHeld: totalHeld,
            },
        });
        res.status(200).send({
            success: true,
            subject,
        });
    }
    catch (err) {
        console.error("Error updating attendance:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
});
router.post("/delete", async (req, res) => {
    try {
        const { recordId, subjectId } = req.body;
        if (!recordId) {
            res.status(400).send({ error: "Record ID is required" });
            return;
        }
        await prisma.dailyAttendance.delete({
            where: { id: recordId },
        });
        if (subjectId) {
            const allRecords = await prisma.dailyAttendance.findMany({
                where: { subjectId },
            });
            const totalHeld = allRecords.filter((r) => r.status === "present" || r.status === "absent").length;
            const attended = allRecords.filter((r) => r.status === "present").length;
            await prisma.subject.update({
                where: { id: subjectId },
                data: { attended, totalHeld },
            });
        }
        res.status(200).send({
            success: true,
            message: "Record deleted",
        });
    }
    catch (err) {
        console.error("Error deleting record:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
});
export default router;
