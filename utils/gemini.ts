import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// Timetable extraction prompt
const TIMETABLE_EXTRACTION_PROMPT = `
**Role:** You are a Data Extraction Expert specializing in academic schedules and JSON formatting.

**Task:** Analyze the provided image of the timetable and convert it into a structured JSON object.

**JSON Structure Rules:**

1. **Root Object:** Must contain "program", "semester", "effective_date", and a "schedule" object.

2. **Schedule Object:** Keys must be the days of the week (e.g., "Monday", "Tuesday").

3. **Time Formatting:** Use 24-hour format for "time_start" and "time_end" (e.g., "14:00").

4. **Multi-Hour Slots (CRITICAL):** If a single session (like a Lab, Workshop, or Training) spans multiple grid columns or rows (e.g., from 12:00 to 2:00), DO NOT create two separate entries. Merge them into one entry with the start time of the first slot and the end time of the last slot.

5. **Batch Handling:**
   - If the slot applies to everyone, set "batch": "All".
   - If a slot is split (e.g., Batch 1 does Lab while Batch 2 does Lecture), use a "sessions" array containing an object for each batch.

**Output Schema:**
{
  "program": "String (e.g., MCA, B.Tech)",
  "semester": "String",
  "effective_date": "YYYY-MM-DD",
  "schedule": {
    "DayName": [
      {
        "time_start": "HH:MM",
        "time_end": "HH:MM",
        "type": "Lecture / Lab / Tutorial / Break / Other",
        "subject": "Subject Name",
        "faculty": "Faculty Name/Initials (if available)",
        "room": "Room Number",
        "batch": "All / B1 / B2",
        "sessions": [
          {"batch": "B1", "subject": "Subject", "faculty": "Name", "room": "Room"},
          {"batch": "B2", "subject": "Subject", "faculty": "Name", "room": "Room"}
        ]
      }
    ]
  }
}

Return ONLY valid JSON, no markdown code blocks or explanations.
`;

// Validation prompt to check if image is a timetable
const TIMETABLE_VALIDATION_PROMPT = `
Analyze this image and determine if it is an academic timetable/class schedule.

A valid timetable typically contains:
- Days of the week (Monday, Tuesday, etc.)
- Time slots
- Subject/course names
- Room numbers or faculty names

Respond with ONLY a JSON object:
{
  "isTimetable": true/false,
  "confidence": "high/medium/low",
  "reason": "Brief explanation"
}

Return ONLY valid JSON, no markdown code blocks.
`;

// Attendance extraction prompt
const ATTENDANCE_EXTRACTION_PROMPT = `
**Role:** You are a Data Extraction Expert specializing in academic attendance records.

**Task:** Analyze the provided attendance document (ERP screenshot, attendance sheet, etc.) and extract subject-wise attendance data.

**Output Schema:**
{
  "subjects": [
    {
      "name": "Subject Name (match exactly as shown)",
      "attended": <number of classes attended>,
      "total": <total classes held>,
      "percentage": <calculated percentage>
    }
  ],
  "extractionDate": "YYYY-MM-DD (date shown on document if available, otherwise null)",
  "confidence": "high / medium / low",
  "notes": "Any unclear data or extraction issues"
}

Return ONLY valid JSON, no markdown code blocks or explanations.
`;

// Types for Gemini responses
export interface TimetableValidation {
  isTimetable: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface TimeSlotData {
  time_start: string;
  time_end: string;
  type: string;
  subject?: string;
  faculty?: string;
  room?: string;
  batch: string;
  sessions?: Array<{
    batch: string;
    subject: string;
    faculty?: string;
    room?: string;
  }>;
}

export interface TimetableOCRResult {
  program: string;
  semester: string;
  effective_date: string;
  schedule: Record<string, TimeSlotData[]>;
}

export interface AttendanceSubject {
  name: string;
  attended: number;
  total: number;
  percentage: number;
}

export interface AttendanceOCRResult {
  subjects: AttendanceSubject[];
  extractionDate: string | null;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/**
 * Download image from URL and convert to base64
 */
async function downloadImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mimeType: string }> {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
  });

  const buffer = Buffer.from(response.data);
  const base64 = buffer.toString("base64");

  // Determine mime type from URL or default to jpeg
  let mimeType = "image/jpeg";
  if (imageUrl.includes(".png")) {
    mimeType = "image/png";
  } else if (imageUrl.includes(".pdf")) {
    mimeType = "application/pdf";
  } else if (imageUrl.includes(".webp")) {
    mimeType = "image/webp";
  }

  return { base64, mimeType };
}

/**
 * Validate if an image is a timetable
 */
export async function validateTimetableImage(
  imageUrl: string
): Promise<TimetableValidation> {
  try {
    // Download image and convert to base64
    const { base64, mimeType } = await downloadImageAsBase64(imageUrl);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { text: TIMETABLE_VALIDATION_PROMPT },
            {
              inlineData: {
                data: base64,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
    });

    const text = response.text || "";
    // Clean up response - remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return JSON.parse(cleanedText) as TimetableValidation;
  } catch (error) {
    console.error("Error validating timetable:", error);
    return {
      isTimetable: false,
      confidence: "low",
      reason: "Failed to analyze image",
    };
  }
}

/**
 * Extract timetable data from an image using Gemini OCR
 */
export async function extractTimetableData(
  imageUrl: string
): Promise<TimetableOCRResult | null> {
  try {
    // Download image and convert to base64
    const { base64, mimeType } = await downloadImageAsBase64(imageUrl);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { text: TIMETABLE_EXTRACTION_PROMPT },
            {
              inlineData: {
                data: base64,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
    });

    const text = response.text || "";
    // Clean up response - remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return JSON.parse(cleanedText) as TimetableOCRResult;
  } catch (error) {
    console.error("Error extracting timetable:", error);
    return null;
  }
}

/**
 * Extract attendance data from a document using Gemini OCR
 */
export async function extractAttendanceData(
  imageUrl: string
): Promise<AttendanceOCRResult | null> {
  try {
    // Download image and convert to base64
    const { base64, mimeType } = await downloadImageAsBase64(imageUrl);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { text: ATTENDANCE_EXTRACTION_PROMPT },
            {
              inlineData: {
                data: base64,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
    });

    const text = response.text || "";
    // Clean up response - remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return JSON.parse(cleanedText) as AttendanceOCRResult;
  } catch (error) {
    console.error("Error extracting attendance:", error);
    return null;
  }
}

export { ai };
