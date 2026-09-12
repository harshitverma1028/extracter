import express from "express";
import {
    getToolStatus,
    validateVideo,
    extractTranscript,
    downloadTest,
    snapshotTest,
    snapshotPdfTest
} from "../controllers/videoController.js";

const router = express.Router();

router.get("/tool-status", getToolStatus);

router.post("/validate", validateVideo);

router.post("/transcript", extractTranscript
);

router.post("/download-test", downloadTest);

router.post("/snapshot-test", snapshotTest);

router.post("/snapshot-pdf-test", snapshotPdfTest);

export default router;