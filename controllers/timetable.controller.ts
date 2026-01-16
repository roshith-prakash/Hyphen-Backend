import { Request, Response } from "express";
import cloudinary from "../utils/cloudinary.ts";
import { prisma } from "../utils/prismaClient.ts";
import {
  validateTimetableImage,
  extractTimetableData,
  TimetableOCRResult,
  TimeSlotData,
} from "../utils/gemini.ts";

// Types for request bodies
interface ConfirmTimetableBody {
  userId: string;
  ocrData: TimetableOCRResult;
  documentUrl: string;
  totalWeeks: number;
  completedWeeks?: number;
  minAttendance?: number;
  userBatch?: string;
}

/**
 * Check if user has an active timetable
 */
export const checkTimetable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.body?.userId;

    if (!userId) {
      res.status(400).send({ error: "User ID is required" });
      return;
    }

    // Check for active timetable
    const timetable = await prisma.timetable.findFirst({
      where: {
        userId: userId,
        isActive: true,
      },
      include: {
        subjects: true,
      },
    });

    if (timetable) {
      res.status(200).send({
        hasTimetable: true,
        timetable: timetable,
      });
    } else {
      res.status(200).send({
        hasTimetable: false,
        message: "No active timetable found. Please upload your timetable.",
      });
    }
  } catch (err) {
    console.error("Error checking timetable:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
};

/**
 * Upload and process timetable image
 * 1. Upload to Cloudinary
 * 2. Validate if it's a timetable using Gemini
 * 3. Extract timetable data if valid
 * 4. Return extracted data for user confirmation
 */
export const uploadTimetable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Check if file is uploaded
    if (!req.file) {
      res.status(400).send({ error: "No file uploaded" });
      return;
    }

    const userId = req.body?.userId;
    if (!userId) {
      res.status(400).send({ error: "User ID is required" });
      return;
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise<{ secure_url: string }>(
      (resolve, reject) => {
        cloudinary.uploader.upload(
          req.file!.path,
          { folder: "hyphen/timetables" },
          (err, result) => {
            if (err) reject(err);
            else resolve(result as { secure_url: string });
          }
        );
      }
    );

    const imageUrl = uploadResult.secure_url;

    // Step 1: Validate if it's a timetable
    const validation = await validateTimetableImage(imageUrl);

    if (!validation.isTimetable) {
      res.status(400).send({
        error: "Invalid timetable",
        message:
          "The uploaded image does not appear to be a valid timetable. Please upload a clear image of your class schedule.",
        details: validation.reason,
        confidence: validation.confidence,
      });
      return;
    }

    // Step 2: Extract timetable data
    const ocrResult = await extractTimetableData(imageUrl);

    if (!ocrResult) {
      res.status(500).send({
        error: "Extraction failed",
        message:
          "Failed to extract data from the timetable. Please try with a clearer image.",
      });
      return;
    }

    // Return extracted data for user confirmation
    res.status(200).send({
      success: true,
      message: "Timetable extracted successfully. Please verify the data.",
      documentUrl: imageUrl,
      extractedData: ocrResult,
      validation: {
        confidence: validation.confidence,
      },
    });
  } catch (err) {
    console.error("Error uploading timetable:", err);
    res.status(500).send({ error: "Something went wrong during upload." });
  }
};

/**
 * Confirm and save timetable after user verification
 * Creates Timetable, DaySchedule, TimeSlot, and Subject records
 */
export const confirmTimetable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      userId,
      ocrData,
      documentUrl,
      totalWeeks,
      completedWeeks = 0,
      minAttendance = 75,
      userBatch = "All",
    }: ConfirmTimetableBody = req.body;

    // Validate required fields
    if (!userId || !ocrData || !documentUrl || !totalWeeks) {
      res.status(400).send({
        error: "Missing required fields",
        required: ["userId", "ocrData", "documentUrl", "totalWeeks"],
      });
      return;
    }

    // Deactivate any existing active timetable for this user
    await prisma.timetable.updateMany({
      where: {
        userId: userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // Parse effective date
    let effectiveDate: Date;
    try {
      effectiveDate = new Date(ocrData.effective_date);
      if (isNaN(effectiveDate.getTime())) {
        effectiveDate = new Date();
      }
    } catch {
      effectiveDate = new Date();
    }

    // Create the timetable
    const timetable = await prisma.timetable.create({
      data: {
        userId: userId,
        program: ocrData.program || "Unknown Program",
        semester: ocrData.semester || "Unknown Semester",
        effectiveDate: effectiveDate,
        totalWeeks: totalWeeks,
        completedWeeks: completedWeeks,
        minAttendance: minAttendance,
        userBatch: userBatch,
        documentUrl: documentUrl,
        rawOcrData: ocrData as object,
        isActive: true,
      },
    });

    // Create DaySchedule and TimeSlot records for each day
    const days = Object.keys(ocrData.schedule);
    for (const day of days) {
      const slots = ocrData.schedule[day];

      const daySchedule = await prisma.daySchedule.create({
        data: {
          timetableId: timetable.id,
          day: day,
        },
      });

      // Create TimeSlot records for this day
      for (const slot of slots) {
        await prisma.timeSlot.create({
          data: {
            dayScheduleId: daySchedule.id,
            timeStart: slot.time_start,
            timeEnd: slot.time_end,
            type: slot.type,
            subject: slot.subject || null,
            faculty: slot.faculty || null,
            room: slot.room || null,
            batch: slot.batch || "All",
            sessions: slot.sessions || null,
          },
        });
      }
    }

    // Aggregate subjects from timetable slots based on user's batch
    const subjectMap = new Map<
      string,
      { name: string; type: string; count: number }
    >();

    for (const day of days) {
      const slots = ocrData.schedule[day];

      for (const slot of slots) {
        // Skip breaks and non-class slots
        if (slot.type === "Break" || slot.type === "Other") continue;

        // Handle split sessions
        if (slot.sessions && Array.isArray(slot.sessions)) {
          const userSession = slot.sessions.find(
            (s) => s.batch === userBatch || userBatch === "All"
          );
          if (userSession && userSession.subject) {
            const key = `${userSession.subject}_${slot.type}`;
            const existing = subjectMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              subjectMap.set(key, {
                name: userSession.subject,
                type: slot.type,
                count: 1,
              });
            }
          }
        } else if (
          (slot.batch === "All" || slot.batch === userBatch) &&
          slot.subject
        ) {
          const key = `${slot.subject}_${slot.type}`;
          const existing = subjectMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            subjectMap.set(key, {
              name: slot.subject,
              type: slot.type,
              count: 1,
            });
          }
        }
      }
    }

    // Fetch old subjects from previous timetables to preserve attendance data
    const oldSubjects = await prisma.subject.findMany({
      where: {
        timetable: {
          userId: userId,
          isActive: false,
        },
      },
    });

    // Create a map of old attendance data by subject name (case-insensitive)
    const oldAttendanceMap = new Map<
      string,
      { attended: number; totalHeld: number }
    >();

    for (const oldSubject of oldSubjects) {
      const key = oldSubject.name.toLowerCase().trim();
      const existing = oldAttendanceMap.get(key);
      if (existing) {
        // Aggregate attendance from all previous timetables
        existing.attended += oldSubject.attended;
        existing.totalHeld += oldSubject.totalHeld;
      } else {
        oldAttendanceMap.set(key, {
          attended: oldSubject.attended,
          totalHeld: oldSubject.totalHeld,
        });
      }
    }

    // Create Subject records with preserved attendance data
    for (const [_, subjectData] of subjectMap) {
      const oldData = oldAttendanceMap.get(subjectData.name.toLowerCase().trim());
      
      await prisma.subject.create({
        data: {
          timetableId: timetable.id,
          name: subjectData.name,
          type: subjectData.type,
          classesPerWeek: subjectData.count,
          totalExpected: subjectData.count * totalWeeks,
          // Preserve attendance data from old subjects if they match
          attended: oldData?.attended || 0,
          totalHeld: oldData?.totalHeld || 0,
        },
      });
    }

    // Fetch complete timetable with all relations
    const completeTimetable = await prisma.timetable.findUnique({
      where: { id: timetable.id },
      include: {
        schedule: {
          include: {
            slots: true,
          },
        },
        subjects: true,
      },
    });

    res.status(201).send({
      success: true,
      message: "Timetable saved successfully",
      timetable: completeTimetable,
    });
  } catch (err) {
    console.error("Error confirming timetable:", err);
    res.status(500).send({ error: "Something went wrong while saving." });
  }
};

/**
 * Get user's active timetable with full details
 */
export const getTimetable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.body?.userId;

    if (!userId) {
      res.status(400).send({ error: "User ID is required" });
      return;
    }

    const timetable = await prisma.timetable.findFirst({
      where: {
        userId: userId,
        isActive: true,
      },
      include: {
        schedule: {
          include: {
            slots: {
              orderBy: {
                timeStart: "asc",
              },
            },
          },
        },
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

    res.status(200).send({ timetable });
  } catch (err) {
    console.error("Error fetching timetable:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
};

/**
 * Update timetable settings (weeks, batch, min attendance)
 */
export const updateTimetable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { timetableId, totalWeeks, completedWeeks, minAttendance, userBatch } =
      req.body;

    if (!timetableId) {
      res.status(400).send({ error: "Timetable ID is required" });
      return;
    }

    const updateData: {
      totalWeeks?: number;
      completedWeeks?: number;
      minAttendance?: number;
      userBatch?: string;
    } = {};

    if (totalWeeks !== undefined) updateData.totalWeeks = totalWeeks;
    if (completedWeeks !== undefined) updateData.completedWeeks = completedWeeks;
    if (minAttendance !== undefined) updateData.minAttendance = minAttendance;
    if (userBatch !== undefined) updateData.userBatch = userBatch;

    const timetable = await prisma.timetable.update({
      where: { id: timetableId },
      data: updateData,
      include: {
        subjects: true,
      },
    });

    // Update totalExpected for all subjects if totalWeeks changed
    if (totalWeeks !== undefined) {
      for (const subject of timetable.subjects) {
        await prisma.subject.update({
          where: { id: subject.id },
          data: {
            totalExpected: subject.classesPerWeek * totalWeeks,
          },
        });
      }
    }

    res.status(200).send({
      success: true,
      message: "Timetable updated successfully",
      timetable,
    });
  } catch (err) {
    console.error("Error updating timetable:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
};

/**
 * Delete a timetable and all related data
 */
export const deleteTimetable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const timetableId = req.body?.timetableId;

    if (!timetableId) {
      res.status(400).send({ error: "Timetable ID is required" });
      return;
    }

    // Prisma will cascade delete related DaySchedule, TimeSlot, Subject, and AttendanceRecord
    await prisma.timetable.delete({
      where: { id: timetableId },
    });

    res.status(200).send({
      success: true,
      message: "Timetable deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting timetable:", err);
    res.status(500).send({ error: "Something went wrong." });
  }
};
