import express from "express";
import {
    getToolStatus,
    validateVideo,
    extractTranscript,
    downloadTest,
    snapshotTest
} from "../controllers/videoController.js";

const router = express.Router();

router.get("/tool-status", getToolStatus);

router.post("/validate", validateVideo);

router.post("/transcript", extractTranscript
);

router.post("/download-test", downloadTest);

router.post("/snapshot-test", snapshotTest);

export default router;