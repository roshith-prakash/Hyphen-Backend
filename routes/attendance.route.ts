import express from "express";
import { Request, Response } from "express";
import { prisma } from "../utils/prismaClient.ts";

const router = express.Router();

// Mark attendance for a specific slot (creates/updates DailyAttendance record)
// POST /api/v1/attendance/mark
router.post("/mark", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, subjectId, date, timeStart, timeEnd, subjectName, subjectType, status } = req.body;

    if (!userId || !subjectId || !date || !timeStart || !status) {
      res.status(400).send({ error: "Missing required fields" });
      return;
    }

    // Parse date to start of day
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Upsert the attendance record
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

    // Fetch subject to get weight multiplier
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });

    if (!subject) {
      res.status(404).send({ error: "Subject not found" });
      return;
    }

    const weight = subject.weight || 1.0;

    // Recalculate subject totals from all daily records with weight applied
    const allRecords = await prisma.dailyAttendance.findMany({
      where: { subjectId },
    });

    // Apply weight to each record count
    const totalHeld = allRecords
      .filter((r) => r.status === "present" || r.status === "absent")
      .reduce((sum) => sum + weight, 0);

    const attended = allRecords
      .filter((r) => r.status === "present")
      .reduce((sum) => sum + weight, 0);

    // Update the Subject aggregate with weighted values
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
  } catch (err) {
    console.error("Error marking attendance:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
});

// Get attendance for a specific date
// POST /api/v1/attendance/date
router.post("/date", async (req: Request, res: Response): Promise<void> => {
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
  } catch (err) {
    console.error("Error fetching attendance:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
});

// Get all attendance records for a user (for dashboard analytics)
// POST /api/v1/attendance/all
router.post("/all", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).send({ error: "userId is required" });
      return;
    }

    const records = await prisma.dailyAttendance.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });

    res.status(200).send({
      success: true,
      records,
    });
  } catch (err) {
    console.error("Error fetching all attendance records:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
});

// Get attendance history for a user (all dates)
// POST /api/v1/attendance/history
router.post("/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, limit = 30 } = req.body;

    if (!userId) {
      res.status(400).send({ error: "userId is required" });
      return;
    }

    // Get unique dates with attendance records
    const records = await prisma.dailyAttendance.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: limit * 10, // Get more records to group by date
    });

    // Group by date
    const byDate: Record<string, typeof records> = {};
    for (const record of records) {
      const dateKey = record.date.toISOString().split("T")[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(record);
    }

    // Convert to array and limit
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
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
});

// Update subject attendance directly (for manual +/- controls)
// POST /api/v1/attendance/update
router.post("/update", async (req: Request, res: Response): Promise<void> => {
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
  } catch (err) {
    console.error("Error updating attendance:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
});

// Delete an attendance record
// POST /api/v1/attendance/delete
router.post("/delete", async (req: Request, res: Response): Promise<void> => {
  try {
    const { recordId, subjectId } = req.body;

    if (!recordId) {
      res.status(400).send({ error: "Record ID is required" });
      return;
    }

    await prisma.dailyAttendance.delete({
      where: { id: recordId },
    });

    // Recalculate subject totals if subjectId provided
    if (subjectId) {
      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      const weight = subject?.weight || 1.0;

      const allRecords = await prisma.dailyAttendance.findMany({
        where: { subjectId },
      });

      const totalHeld = allRecords
        .filter((r) => r.status === "present" || r.status === "absent")
        .reduce((sum) => sum + weight, 0);
      const attended = allRecords
        .filter((r) => r.status === "present")
        .reduce((sum) => sum + weight, 0);

      await prisma.subject.update({
        where: { id: subjectId },
        data: { attended, totalHeld },
      });
    }

    res.status(200).send({
      success: true,
      message: "Record deleted",
    });
  } catch (err) {
    console.error("Error deleting record:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
});

export default router;
