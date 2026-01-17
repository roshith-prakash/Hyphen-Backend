import { GoogleGenAI } from "@google/genai";
declare const ai: GoogleGenAI;
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
export declare function validateTimetableImage(imageUrl: string): Promise<TimetableValidation>;
export declare function extractTimetableData(imageUrl: string): Promise<TimetableOCRResult | null>;
export declare function extractAttendanceData(imageUrl: string): Promise<AttendanceOCRResult | null>;
export { ai };
export declare function generateAttendanceGuidance(attendanceData: {
    overallPercentage: number;
    minAttendance: number;
    completedWeeks: number;
    totalWeeks: number;
    subjects: Array<{
        name: string;
        type: string;
        currentPercentage: number;
        attended: number;
        totalHeld: number;
        classesPerWeek: number;
        isAtRisk: boolean;
    }>;
}): Promise<any>;
