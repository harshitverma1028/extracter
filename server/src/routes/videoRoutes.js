import express from "express";
import {
    getToolStatus,
    validateVideo
} from "../controllers/videocontroller.js";

const router = express.Router();

router.get("/tool-status", getToolStatus);

router.post("/validate", validateVideo);

export default router;