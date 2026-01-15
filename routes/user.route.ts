import upload from "../utils/multer.ts";
import {
  createUser,
  getCurrentUser,
  getUserProfile,
  updateUser,
  deleteUser,
} from "../controllers/user.controller.ts";
import { Router } from "express";

// Create a router.
const router = Router();

// Default route to check if auth routes are accessible.
router.get("/", (_, res) => {
  res.status(200).send({ data: "Auth Route" });
});

// ---------------------------------------------------------------------

// USER ROUTES

// Create a new user in the database.
router.post("/create-user", upload.single("file"), createUser);

// Get the current user from the DB.
router.post("/get-current-user", getCurrentUser);

// Get the user information from the DB.
router.post("/get-user-info", getUserProfile);

// Update the user's details in the database.
router.post("/update-user", upload.single("file"), updateUser);

// Delete the user data from the database.
router.post("/delete-user", deleteUser);

// ---------------------------------------------------------------------

export default router;