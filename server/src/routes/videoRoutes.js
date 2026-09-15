import express from "express";
import {
    getToolStatus,
    validateVideo,
    extractTranscript,
    downloadTest,
    snapshotTest,
    snapshotPdfTest,
    getAIStatus,
    summaryTest,
    questionsTest,
    learningPackageTest,
    generateLearningPackage
} from "../controllers/videoController.js";

const router = express.Router();

router.get("/tool-status", getToolStatus);

router.post("/validate", validateVideo);

router.post("/transcript", extractTranscript
);

router.post("/download-test", downloadTest);

router.post("/snapshot-test", snapshotTest);

router.post("/snapshot-pdf-test", snapshotPdfTest);

router.get("/ai-status", getAIStatus);

router.post("/summary-test", summaryTest);

router.post("/questions-test", questionsTest);
    
router.post("/learning-package-test", learningPackageTest);

router.post("/learning-package", generateLearningPackage);


export default router;