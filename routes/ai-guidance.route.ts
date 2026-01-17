import express from "express";
import { generateAttendanceGuidance } from "../utils/gemini.ts";
import {prisma} from "../utils/prismaClient.ts";

const router = express.Router();

/**
 * Generate AI-powered attendance guidance
 * POST /api/v1/ai-guidance/analyze
 */
router.post("/analyze", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).send({ error: "User ID is required" });
      return;
    }

    // Fetch user's active timetable with subjects
    const timetable = await prisma.timetable.findFirst({
      where: {
        userId: userId,
        isActive: true,
      },
      include: {
        subjects: true,
      },
    });

    if (!timetable) {
      res.status(404).send({
        error: "No timetable found",
        message: "Please upload your timetable first.",
      });
      return;
    }

    // Calculate overall attendance
    const totalAttended = timetable.subjects.reduce((sum, s) => sum + s.attended, 0);
    const totalHeld = timetable.subjects.reduce((sum, s) => sum + s.totalHeld, 0);
    const overallPercentage = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;

    // Prepare subjects data
    const subjectsData = timetable.subjects.map(subject => ({
      name: subject.name,
      type: subject.type,
      currentPercentage: subject.totalHeld > 0 ? (subject.attended / subject.totalHeld) * 100 : 0,
      attended: subject.attended,
      totalHeld: subject.totalHeld,
      classesPerWeek: subject.classesPerWeek,
      isAtRisk: subject.totalHeld > 0 ? (subject.attended / subject.totalHeld) * 100 < timetable.minAttendance : false,
    }));

    // Generate AI guidance
    const guidance = await generateAttendanceGuidance({
      overallPercentage,
      minAttendance: timetable.minAttendance,
      completedWeeks: timetable.completedWeeks,
      totalWeeks: timetable.totalWeeks,
      subjects: subjectsData,
    });

    res.status(200).send({
      success: true,
      guidance,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error generating AI guidance:", error);
    res.status(500).send({
      error: "Failed to generate guidance",
      message: error.message || "Something went wrong",
    });
  }
});

export default router;
