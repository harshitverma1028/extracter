import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

const getYtDlpCommand = () => {
    return (
        process.env.YTDLP_PATH ||
        (process.platform === "win32"
            ? "yt-dlp.exe"
            : "yt-dlp")
    );
};

const getFfmpegCommand = () => {
    return (
        process.env.FFMPEG_PATH ||
        (process.platform === "win32"
            ? "ffmpeg.exe"
            : "ffmpeg")
    );
};

/*
|--------------------------------------------------------------------------
| Create temporary directory
|--------------------------------------------------------------------------
*/

const createTempDirectory = async () => {
    const directory = path.join(
        os.tmpdir(),
        `ai-video-${crypto.randomUUID()}`
    );

    await fs.mkdir(directory, {
        recursive: true
    });

    return directory;
};

/*
|--------------------------------------------------------------------------
| Check FFmpeg
|--------------------------------------------------------------------------
*/

export const checkFFmpeg = async () => {
    const command = getFfmpegCommand();

    try {
        const { stdout, stderr } =
            await execFileAsync(
                command,
                ["-version"],
                {
                    windowsHide: true
                }
            );

        const output = stdout || stderr;

        const firstLine =
            output.split(/\r?\n/)[0];

        return {
            installed: true,
            command,
            version: firstLine
        };

    } catch (error) {

        if (error.code === "ENOENT") {
            return {
                installed: false,
                command,
                version: null,
                error:
                    "FFmpeg was not found. Install FFmpeg and add it to PATH, or set FFMPEG_PATH."
            };
        }

        return {
            installed: false,
            command,
            version: null,
            error: error.message
        };
    }
};

/*
|--------------------------------------------------------------------------
| Download YouTube video
|--------------------------------------------------------------------------
*/

export const downloadVideo = async (url) => {

    const ytDlp = getYtDlpCommand();

    const tempDirectory =
        await createTempDirectory();

    const outputPath = path.join(
        tempDirectory,
        "video.mp4"
    );

    try {

        console.log("Starting video download...");

        await execFileAsync(
            ytDlp,
            [
                "-f",
                "bv*[height<=720]+ba/b[height<=720]/b",

                "--merge-output-format",
                "mp4",

                "--no-playlist",
                "--no-warnings",

                "-o",
                outputPath,

                url
            ],
            {
                windowsHide: true,

                /*
                50 MB stdout/stderr buffer.
                */

                maxBuffer:
                    50 * 1024 * 1024
            }
        );

        /*
        Verify the output file exists.
        */

        const stats =
            await fs.stat(outputPath);

        if (!stats.isFile() || stats.size === 0) {
            throw new Error(
                "yt-dlp completed but no video file was created."
            );
        }

        console.log(
            `Video downloaded: ${(
                stats.size /
                (1024 * 1024)
            ).toFixed(2)} MB`
        );

        return {
            path: outputPath,
            directory: tempDirectory,
            size: stats.size
        };

    } catch (error) {

        /*
        ENOENT = executable not found.
        */

        if (error.code === "ENOENT") {

            throw new Error(
                "yt-dlp was not found. Check yt-dlp installation/PATH."
            );
        }

        throw new Error(
            error.stderr?.trim() ||
            error.message ||
            "Video download failed."
        );
    }
};

/*
|--------------------------------------------------------------------------
| Read video information using FFmpeg
|--------------------------------------------------------------------------
*/

export const getVideoMetadata =
    async (videoPath) => {

        const ffmpeg =
            getFfmpegCommand();

        try {

            const { stdout, stderr } =
                await execFileAsync(
                    ffmpeg,
                    [
                        "-i",
                        videoPath
                    ],
                    {
                        windowsHide: true,

                        maxBuffer:
                            10 * 1024 * 1024
                    }
                );

            const output =
                stdout + stderr;

            return parseFFmpegMetadata(
                output
            );

        } catch (error) {

            /*
            FFmpeg normally exits with code 1
            when only -i is provided.

            That's okay because the metadata
            is still present in stderr.
            */

            const output =
                (error.stdout || "") +
                (error.stderr || "");

            if (
                output.includes("Duration:")
            ) {
                return parseFFmpegMetadata(
                    output
                );
            }

            if (error.code === "ENOENT") {
                throw new Error(
                    "FFmpeg was not found. Check FFmpeg installation/PATH."
                );
            }

            throw new Error(
                error.message ||
                "Unable to read video metadata."
            );
        }
    };

/*
|--------------------------------------------------------------------------
| Parse FFmpeg metadata
|--------------------------------------------------------------------------
*/

const parseFFmpegMetadata = (output) => {

    const durationMatch =
        output.match(
            /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/ 
        );

    const resolutionMatch =
        output.match(
            /Stream.*Video:.*?(\d{2,5})x(\d{2,5})/
        );

    let duration = null;

    if (durationMatch) {

        const hours =
            Number(durationMatch[1]);

        const minutes =
            Number(durationMatch[2]);

        const seconds =
            Number(durationMatch[3]);

        duration =
            hours * 3600 +
            minutes * 60 +
            seconds;
    }

    return {
        duration,
        width: resolutionMatch
            ? Number(resolutionMatch[1])
            : null,
        height: resolutionMatch
            ? Number(resolutionMatch[2])
            : null
    };
};

/*
|--------------------------------------------------------------------------
| Delete temporary video
|--------------------------------------------------------------------------
*/

export const cleanupVideo =
    async (directory) => {

        if (!directory) {
            return;
        }

        await fs.rm(
            directory,
            {
                recursive: true,
                force: true
            }
        );
    };