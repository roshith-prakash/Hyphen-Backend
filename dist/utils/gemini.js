import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
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
async function downloadImageAsBase64(imageUrl) {
    const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
    });
    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString("base64");
    let mimeType = response.headers["content-type"] || "image/jpeg";
    if (mimeType === "application/octet-stream") {
        if (imageUrl.includes(".png"))
            mimeType = "image/png";
        else if (imageUrl.includes(".pdf"))
            mimeType = "application/pdf";
        else if (imageUrl.includes(".webp"))
            mimeType = "image/webp";
    }
    return { base64, mimeType };
}
export async function validateTimetableImage(imageUrl) {
    try {
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
        const cleanedText = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
        return JSON.parse(cleanedText);
    }
    catch (error) {
        console.error("Error validating timetable:", error);
        return {
            isTimetable: false,
            confidence: "low",
            reason: "Failed to analyze image",
        };
    }
}
export async function extractTimetableData(imageUrl) {
    try {
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
        const cleanedText = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
        return JSON.parse(cleanedText);
    }
    catch (error) {
        console.error("Error extracting timetable:", error);
        return null;
    }
}
export async function extractAttendanceData(imageUrl) {
    try {
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
        const cleanedText = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
        return JSON.parse(cleanedText);
    }
    catch (error) {
        console.error("Error extracting attendance:", error);
        return null;
    }
}
export { ai };
export async function generateAttendanceGuidance(attendanceData) {
    const remainingWeeks = attendanceData.totalWeeks - attendanceData.completedWeeks;
    const atRiskSubjects = attendanceData.subjects.filter(s => s.isAtRisk);
    const subjectList = attendanceData.subjects
        .map(s => `- ${s.name} (${s.type}): ${s.currentPercentage.toFixed(1)}% (${s.attended}/${s.totalHeld} classes)`)
        .join('\n');
    const atRiskList = atRiskSubjects.length > 0
        ? atRiskSubjects.map(s => `- ${s.name}: ${s.currentPercentage.toFixed(1)}%`).join('\n')
        : 'None - all subjects are on track!';
    const prompt = `
You are an academic attendance advisor helping a college student understand their attendance situation and plan for improvement.

**Student's Current Situation:**
- Overall Attendance: ${attendanceData.overallPercentage.toFixed(1)}%
- Minimum Required: ${attendanceData.minAttendance}%
- Weeks Completed: ${attendanceData.completedWeeks} of ${attendanceData.totalWeeks}
- Remaining Weeks: ${remainingWeeks}

**Subject-wise Breakdown:**
${subjectList}

**At-Risk Subjects (below ${attendanceData.minAttendance}%):**
${atRiskList}

**Your Task:**
Provide a concise, empathetic analysis in these sections:

1. **Risk Assessment** (2-3 sentences)
   - Explain their current attendance status clearly
   - Highlight the most critical subjects if any

2. **Immediate Actions** (3-4 bullet points)
   - Specific, actionable steps they should take this week
   - Prioritize by urgency
   - Be concrete (e.g., "Attend all Database lectures this week" not "Try to attend more")

3. **Strategic Advice** (2-3 bullet points)
   - Long-term planning suggestions
   - How to stay on track for the rest of the semester

4. **Motivation** (1-2 sentences)
   - Encouraging message based on their situation
   - Acknowledge progress if any

Keep your tone:
- Supportive and non-judgmental
- Clear and direct
- Motivating but realistic

Return ONLY a valid JSON object with this structure (no markdown, no code blocks):
{
  "riskLevel": "low|medium|high",
  "riskExplanation": "...",
  "immediateActions": ["...", "...", "..."],
  "strategicAdvice": ["...", "..."],
  "motivationalMessage": "..."
}
`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ],
        });
        const responseText = response.text || "";
        let cleanedText = responseText.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/```json\n?/, '').replace(/\n?```$/, '');
        }
        else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/```\n?/, '').replace(/\n?```$/, '');
        }
        const guidance = JSON.parse(cleanedText);
        return guidance;
    }
    catch (error) {
        console.error('Error generating attendance guidance:', error);
        throw new Error('Failed to generate AI guidance');
    }
}
const ATTENDANCE_REPORT_EXTRACTION_PROMPT = `
**Role:** You are a Data Extraction Expert specializing in academic attendance reports.

**Task:** Analyze the provided attendance PDF report and extract ALL attendance records in JSON format.

The report contains:
1. Student details (name, roll number, program, semester, duration)
2. A table with columns: Sr No, Course Name, Date, Start Time, End Time, Attendance

**Course Name Format:**
- Pattern: "{Subject}{Type}{Section} {Program} {Batch?}"
- Examples:
  - "Software EngineeringT1 MCA" → Subject="Software Engineering", Type="T1", Batch="All"
  - "Advanced JavaP1 MCA B2" → Subject="Advanced Java", Type="P1", Batch="B2"

**Type Code Mapping:**
- "T1" or "T" → "Lecture"
- "P1" or "P" → "Lab"
- "U1" or "U" → "Lecture"

**Attendance Code Mapping:**
- "P" → "present"
- "A" → "absent"
- "NU", "AG", "L" → "present"

**Instructions:**
Extract ALL table rows with:
- courseCode (full string)
- courseName (clean subject name)
- type ("Lecture" or "Lab")
- batch ("B1", "B2", or "All")
- date (YYYY-MM-DD)
- startTime, endTime (HH:MM 24-hour)
- status ("present" or "absent")

**Output Schema:**
{
  "studentName": "Student Name",
  "rollNo": "Roll Number",
  "program": "Program Name",
  "semester": "Semester",
  "duration": {
    "from": "YYYY-MM-DD",
    "to": "YYYY-MM-DD"
  },
  "records": [
    {
      "courseCode": "Subject Code",
      "courseName": "Subject Name",
      "type": "Lecture" or "Lab",
      "batch": "All" or "B1/B2",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "status": "present" or "absent"
    }
  ]
}

Return ONLY valid JSON, no markdown. Ensure the "records" array is present even if empty.
`;
export async function extractAttendanceReport(imageUrl) {
    try {
        const { base64, mimeType } = await downloadImageAsBase64(imageUrl);
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: ATTENDANCE_REPORT_EXTRACTION_PROMPT },
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
        const cleanedText = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
        return JSON.parse(cleanedText);
    }
    catch (error) {
        console.error("Error extracting attendance report:", error);
        return null;
    }
}
