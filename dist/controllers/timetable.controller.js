import cloudinary from "../utils/cloudinary.js";
import { prisma } from "../utils/prismaClient.js";
import { validateTimetableImage, extractTimetableData, } from "../utils/gemini.js";
export const checkTimetable = async (req, res) => {
    var _a;
    try {
        const userId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId;
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
                subjects: true,
            },
        });
        if (timetable) {
            res.status(200).send({
                hasTimetable: true,
                timetable: timetable,
            });
        }
        else {
            res.status(200).send({
                hasTimetable: false,
                message: "No active timetable found. Please upload your timetable.",
            });
        }
    }
    catch (err) {
        console.error("Error checking timetable:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
};
export const uploadTimetable = async (req, res) => {
    var _a;
    try {
        if (!req.file) {
            res.status(400).send({ error: "No file uploaded" });
            return;
        }
        const userId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            res.status(400).send({ error: "User ID is required" });
            return;
        }
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload(req.file.path, { folder: "hyphen/timetables" }, (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result);
            });
        });
        const imageUrl = uploadResult.secure_url;
        const validation = await validateTimetableImage(imageUrl);
        if (!validation.isTimetable) {
            res.status(400).send({
                error: "Invalid timetable",
                message: "The uploaded image does not appear to be a valid timetable. Please upload a clear image of your class schedule.",
                details: validation.reason,
                confidence: validation.confidence,
            });
            return;
        }
        const ocrResult = await extractTimetableData(imageUrl);
        if (!ocrResult) {
            res.status(500).send({
                error: "Extraction failed",
                message: "Failed to extract data from the timetable. Please try with a clearer image.",
            });
            return;
        }
        res.status(200).send({
            success: true,
            message: "Timetable extracted successfully. Please verify the data.",
            documentUrl: imageUrl,
            extractedData: ocrResult,
            validation: {
                confidence: validation.confidence,
            },
        });
    }
    catch (err) {
        console.error("Error uploading timetable:", err);
        res.status(500).send({ error: "Something went wrong during upload." });
    }
};
export const confirmTimetable = async (req, res) => {
    try {
        const { userId, ocrData, documentUrl, totalWeeks, completedWeeks = 0, minAttendance = 75, userBatch = "All", } = req.body;
        if (!userId || !ocrData || !documentUrl || !totalWeeks) {
            res.status(400).send({
                error: "Missing required fields",
                required: ["userId", "ocrData", "documentUrl", "totalWeeks"],
            });
            return;
        }
        await prisma.timetable.updateMany({
            where: {
                userId: userId,
                isActive: true,
            },
            data: {
                isActive: false,
            },
        });
        let effectiveDate;
        try {
            effectiveDate = new Date(ocrData.effective_date);
            if (isNaN(effectiveDate.getTime())) {
                effectiveDate = new Date();
            }
        }
        catch (_a) {
            effectiveDate = new Date();
        }
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
                rawOcrData: ocrData,
                isActive: true,
            },
        });
        const days = Object.keys(ocrData.schedule);
        for (const day of days) {
            const slots = ocrData.schedule[day];
            const daySchedule = await prisma.daySchedule.create({
                data: {
                    timetableId: timetable.id,
                    day: day,
                },
            });
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
        const subjectMap = new Map();
        for (const day of days) {
            const slots = ocrData.schedule[day];
            for (const slot of slots) {
                if (slot.type === "Break" || slot.type === "Other")
                    continue;
                if (slot.sessions && Array.isArray(slot.sessions)) {
                    const userSession = slot.sessions.find((s) => s.batch === userBatch || userBatch === "All");
                    if (userSession && userSession.subject) {
                        const key = `${userSession.subject}_${slot.type}`;
                        const existing = subjectMap.get(key);
                        if (existing) {
                            existing.count++;
                        }
                        else {
                            subjectMap.set(key, {
                                name: userSession.subject,
                                type: slot.type,
                                count: 1,
                            });
                        }
                    }
                }
                else if ((slot.batch === "All" || slot.batch === userBatch) &&
                    slot.subject) {
                    const key = `${slot.subject}_${slot.type}`;
                    const existing = subjectMap.get(key);
                    if (existing) {
                        existing.count++;
                    }
                    else {
                        subjectMap.set(key, {
                            name: slot.subject,
                            type: slot.type,
                            count: 1,
                        });
                    }
                }
            }
        }
        const oldSubjects = await prisma.subject.findMany({
            where: {
                timetable: {
                    userId: userId,
                    isActive: false,
                },
            },
        });
        const oldAttendanceMap = new Map();
        for (const oldSubject of oldSubjects) {
            const key = oldSubject.name.toLowerCase().trim();
            const existing = oldAttendanceMap.get(key);
            if (existing) {
                existing.attended += oldSubject.attended;
                existing.totalHeld += oldSubject.totalHeld;
            }
            else {
                oldAttendanceMap.set(key, {
                    attended: oldSubject.attended,
                    totalHeld: oldSubject.totalHeld,
                });
            }
        }
        for (const [_, subjectData] of subjectMap) {
            const oldData = oldAttendanceMap.get(subjectData.name.toLowerCase().trim());
            await prisma.subject.create({
                data: {
                    timetableId: timetable.id,
                    name: subjectData.name,
                    type: subjectData.type,
                    classesPerWeek: subjectData.count,
                    totalExpected: subjectData.count * totalWeeks,
                    attended: (oldData === null || oldData === void 0 ? void 0 : oldData.attended) || 0,
                    totalHeld: (oldData === null || oldData === void 0 ? void 0 : oldData.totalHeld) || 0,
                },
            });
        }
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
    }
    catch (err) {
        console.error("Error confirming timetable:", err);
        res.status(500).send({ error: "Something went wrong while saving." });
    }
};
export const getTimetable = async (req, res) => {
    var _a;
    try {
        const userId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId;
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
    }
    catch (err) {
        console.error("Error fetching timetable:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
};
export const updateTimetable = async (req, res) => {
    try {
        const { timetableId, totalWeeks, completedWeeks, minAttendance, userBatch } = req.body;
        if (!timetableId) {
            res.status(400).send({ error: "Timetable ID is required" });
            return;
        }
        const updateData = {};
        if (totalWeeks !== undefined)
            updateData.totalWeeks = totalWeeks;
        if (completedWeeks !== undefined)
            updateData.completedWeeks = completedWeeks;
        if (minAttendance !== undefined)
            updateData.minAttendance = minAttendance;
        if (userBatch !== undefined)
            updateData.userBatch = userBatch;
        const timetable = await prisma.timetable.update({
            where: { id: timetableId },
            data: updateData,
            include: {
                subjects: true,
            },
        });
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
    }
    catch (err) {
        console.error("Error updating timetable:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
};
export const deleteTimetable = async (req, res) => {
    var _a;
    try {
        const timetableId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.timetableId;
        if (!timetableId) {
            res.status(400).send({ error: "Timetable ID is required" });
            return;
        }
        await prisma.timetable.delete({
            where: { id: timetableId },
        });
        res.status(200).send({
            success: true,
            message: "Timetable deleted successfully",
        });
    }
    catch (err) {
        console.error("Error deleting timetable:", err);
        res.status(500).send({ error: "Something went wrong." });
    }
};
