import express from "express";
import upload from "../utils/multer.ts";
import {
  checkTimetable,
  uploadTimetable,
  confirmTimetable,
  getTimetable,
  updateTimetable,
  deleteTimetable,
} from "../controllers/timetable.controller.ts";

const router = express.Router();

// Check if user has an active timetable
// POST /api/v1/timetable/check
router.post("/check", checkTimetable);

// Upload and process timetable image (returns extracted data for verification)
// POST /api/v1/timetable/upload
router.post("/upload", upload.single("timetable"), uploadTimetable);

// Confirm and save timetable after user verification
// POST /api/v1/timetable/confirm
router.post("/confirm", confirmTimetable);

// Get user's active timetable with full schedule
// POST /api/v1/timetable
router.post("/", getTimetable);

// Update timetable settings (weeks, batch, min attendance)
// PUT /api/v1/timetable
router.put("/", updateTimetable);

// Delete a timetable
// DELETE /api/v1/timetable
router.delete("/", deleteTimetable);

export default router;
