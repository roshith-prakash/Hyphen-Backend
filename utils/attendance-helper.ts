// Helper functions for attendance report processing

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
        Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }

    return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Match a course from the report to a subject in the timetable
 */
export async function matchSubjectFromReport(
    courseName: string,
    type: string,
    subjects: any[]
): Promise<any | null> {
    const normalizedCourse = courseName.toLowerCase().replace(/\s+/g, "");
    const targetType = type === "Lab" ? "Lab" : "Lecture";

    // Try exact match first
    for (const subject of subjects) {
        const normalizedSubject = subject.name.toLowerCase().replace(/\s+/g, "");
        if (normalizedSubject === normalizedCourse && subject.type === targetType) {
            return subject;
        }
    }

    // Try fuzzy match (80% similarity threshold)
    let bestMatch: any | null = null;
    let bestScore = 0;

    // Try substring matches (e.g. "Advanced JavaP1" contains "Advanced Java")
    for (const subject of subjects) {
        if (subject.type !== targetType) continue;

        const normalizedSubject = subject.name.toLowerCase().replace(/\s+/g, "");
        // Avoid matching very short names to prevent false positives
        if (normalizedSubject.length < 4) continue;

        if (normalizedCourse.includes(normalizedSubject)) {
            return subject;
        }
    }

    for (const subject of subjects) {
        if (subject.type !== targetType) continue;

        const normalizedSubject = subject.name.toLowerCase().replace(/\s+/g, "");
        const similarity = calculateSimilarity(normalizedCourse, normalizedSubject);

        if (similarity >= 0.8 && similarity > bestScore) {
            bestMatch = subject;
            bestScore = similarity;
        }
    }

    return bestMatch;
}
