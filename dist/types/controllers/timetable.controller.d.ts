import { Request, Response } from "express";
export declare const checkTimetable: (req: Request, res: Response) => Promise<void>;
export declare const uploadTimetable: (req: Request, res: Response) => Promise<void>;
export declare const confirmTimetable: (req: Request, res: Response) => Promise<void>;
export declare const getTimetable: (req: Request, res: Response) => Promise<void>;
export declare const updateTimetable: (req: Request, res: Response) => Promise<void>;
export declare const deleteTimetable: (req: Request, res: Response) => Promise<void>;
