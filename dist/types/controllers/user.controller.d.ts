import { Request, Response } from "express";
export declare const createUser: (req: Request, res: Response) => Promise<void>;
export declare const getCurrentUser: (req: Request, res: Response) => Promise<void>;
export declare const getUserProfile: (req: Request, res: Response) => Promise<void>;
export declare const updateUser: (req: Request, res: Response) => Promise<void>;
export declare const deleteUser: (req: Request, res: Response) => Promise<void>;
