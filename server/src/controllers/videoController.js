import {
    isValidYouTubeUrl,
    checkYtDlp,
    getVideoInfo,
    getTranscript
} from "../utils/youtube.js";

import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";

import {
    generateSnapshotPDF
} from "../services/pdfService.js";

import {
    checkFFmpeg,
    downloadVideo,
    getVideoMetadata,
    cleanupVideo
} from "../services/videoService.js";

import {
    extractDistinctSnapshots
} from "../services/snapshotService.js";


export const getToolStatus = async (req, res) => {
    const ytDlp = await checkYtDlp();

    res.status(200).json({
        success: true,
        tools: {
            ytDlp
        }
    });
};



export const validateVideo = async (req, res) => {
    try {
        const { videoUrl } = req.body;

        if (!videoUrl) {
            return res.status(400).json({
                success: false,
                message: "videoUrl is required."
            });
        }

        if (!isValidYouTubeUrl(videoUrl)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid YouTube URL."
            });
        }

        const toolStatus = await checkYtDlp();

        if (!toolStatus.installed) {
            return res.status(500).json({
                success: false,
                message: toolStatus.error,
                toolStatus
            });
        }

        const video = await getVideoInfo(videoUrl);

        return res.status(200).json({
            success: true,
            message: "YouTube video validated successfully.",
            video
        });
    } catch (error) {
        console.error("YouTube validation error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to validate YouTube video."
        });
    }
};



export const extractTranscript = async (req, res) => {
    try {
        const { videoUrl } = req.body;

        if (!videoUrl) {
            return res.status(400).json({
                success: false,
                message: "videoUrl is required."
            });
        }

        if (!isValidYouTubeUrl(videoUrl)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid YouTube URL."
            });
        }

        const toolStatus = await checkYtDlp();

        if (!toolStatus.installed) {
            return res.status(500).json({
                success: false,
                message: toolStatus.error
            });
        }

        const transcriptData =
            await getTranscript(videoUrl);

        return res.status(200).json({
            success: true,
            message: "Transcript extracted successfully.",
            transcript: transcriptData
        });

    } catch (error) {
        console.error(
            "Transcript extraction error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to extract transcript."
        });
    }
};


/*
|--------------------------------------------------------------------------
| POST /api/videos/download-test
|--------------------------------------------------------------------------
*/

export const downloadTest = async (req, res) => {

    let downloadedVideo = null;

    try {

        const { videoUrl } = req.body;

        if (!videoUrl) {
            return res.status(400).json({
                success: false,
                message: "videoUrl is required."
            });
        }

        if (!isValidYouTubeUrl(videoUrl)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid YouTube URL."
            });
        }

        const ffmpeg =
            await checkFFmpeg();

        if (!ffmpeg.installed) {
            return res.status(500).json({
                success: false,
                message: ffmpeg.error
            });
        }

        const ytDlp =
            await checkYtDlp();

        if (!ytDlp.installed) {
            return res.status(500).json({
                success: false,
                message: ytDlp.error
            });
        }

        /*
        Download video.
        */

        downloadedVideo =
            await downloadVideo(
                videoUrl
            );

        /*
        Verify FFmpeg can read it.
        */

        const metadata =
            await getVideoMetadata(
                downloadedVideo.path
            );

        return res.status(200).json({
            success: true,
            message:
                "Video downloaded and verified successfully.",

            video: {
                sizeBytes:
                    downloadedVideo.size,

                sizeMB:
                    Number(
                        (
                            downloadedVideo.size /
                            (1024 * 1024)
                        ).toFixed(2)
                    ),

                metadata
            }
        });

    } catch (error) {

        console.error(
            "Video download test failed:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Video processing failed."
        });

    } finally {

        /*
        Important:
        Remove downloaded video after
        verification.

        Later the snapshot pipeline will
        keep the temporary video only for
        the duration of processing.
        */

        if (downloadedVideo?.directory) {
            await cleanupVideo(
                downloadedVideo.directory
            );
        }
    }
};

/*
|--------------------------------------------------------------------------
| POST /api/videos/snapshot-test
|--------------------------------------------------------------------------
*/

export const snapshotTest = async (req, res) => {

    let video = null;
    let snapshots = null;

    try {

        const { videoUrl } = req.body;

        if (!videoUrl) {
            return res.status(400).json({
                success: false,
                message: "videoUrl is required."
            });
        }

        /*
        Download temporary video.
        */

        video =
            await downloadVideo(
                videoUrl
            );

        /*
        Extract visually distinct frames.
        */

        snapshots =
            await extractDistinctSnapshots(
                video.path
            );

        return res.status(200).json({
            success: true,

            message:
                "Distinct snapshots extracted successfully.",

            count:
                snapshots.snapshots.length,

            snapshots:
                snapshots.snapshots.map(
                    (snapshot) => ({
                        index:
                            snapshot.index,

                        path:
                            snapshot.path
                    })
                )
        });

    } catch (error) {

        console.error(
            "Snapshot extraction failed:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Snapshot extraction failed."
        });

    } finally {

        /*
        Clean downloaded video.
        */

        if (video?.directory) {
            await cleanupVideo(
                video.directory
            );
        }
    }
};


/*
|--------------------------------------------------------------------------
| POST /api/videos/snapshot-pdf-test
|--------------------------------------------------------------------------
*/

export const snapshotPdfTest =
    async (req, res) => {

        let video = null;
        let snapshots = null;

        const jobDirectory =
            path.join(
                os.tmpdir(),
                `pdf-test-${crypto.randomUUID()}`
            );

        try {

            const {
                videoUrl
            } = req.body;

            const {
                getVideoInfo
            } = await import(
                "../utils/youtube.js"
            );

            if (!videoUrl) {
                return res.status(400).json({
                    success: false,
                    message:
                        "videoUrl is required."
                });
            }

            /*
            Get metadata
            */

            const videoInfo =
                await getVideoInfo(
                    videoUrl
                );

            /*
            Download video
            */

            video =
                await downloadVideo(
                    videoUrl
                );

            /*
            Extract snapshots
            */

            snapshots =
                await extractDistinctSnapshots(
                    video.path
                );

            /*
            Create PDF directory
            */

            await fs.mkdir(
                jobDirectory,
                {
                    recursive: true
                }
            );

            const pdfPath =
                path.join(
                    jobDirectory,
                    "video-snapshots.pdf"
                );

            /*
            Generate PDF
            */

            await generateSnapshotPDF({
                videoTitle:
                    videoInfo.title,

                videoUrl,

                snapshots:
                    snapshots.snapshots,

                outputPath:
                    pdfPath
            });

            /*
            Send PDF
            */

            res.download(
                pdfPath,
                "video-snapshots.pdf",
                async () => {

                    await fs.rm(
                        jobDirectory,
                        {
                            recursive: true,
                            force: true
                        }
                    );
                }
            );

        } catch (error) {

            console.error(
                "Snapshot PDF failed:",
                error
            );

            await fs.rm(
                jobDirectory,
                {
                    recursive: true,
                    force: true
                }
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Failed to generate snapshot PDF."
            });

        } finally {

            /*
            Delete downloaded video.
            */

            if (video?.directory) {
                await cleanupVideo(
                    video.directory
                );
            }
        }
    };