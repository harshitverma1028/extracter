import { execFile } from "child_process";
import { promisify } from "util";
import validator from "validator";

import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

/*
|--------------------------------------------------------------------------
| Validate YouTube URL
|--------------------------------------------------------------------------
*/

export const isValidYouTubeUrl = (url) => {
    if (!url || typeof url !== "string") {
        return false;
    }

    if (!validator.isURL(url, {
        protocols: ["http", "https"],
        require_protocol: true
    })) {
        return false;
    }

    try {
        const parsed = new URL(url);

        const hostname = parsed.hostname.toLowerCase();

        return (
            hostname === "youtube.com" ||
            hostname === "www.youtube.com" ||
            hostname === "m.youtube.com" ||
            hostname === "youtu.be" ||
            hostname === "www.youtu.be"
        );
    } catch {
        return false;
    }
};

/*
|--------------------------------------------------------------------------
| Find yt-dlp executable
|--------------------------------------------------------------------------
|
| Development:
|   yt-dlp
|
| Windows:
|   yt-dlp.exe
|
| Render/Docker:
|   yt-dlp
|
| You can override this using:
|
|   YTDLP_PATH=/custom/path/yt-dlp
|
|--------------------------------------------------------------------------
*/

const getYtDlpCommand = () => {
    return process.env.YTDLP_PATH || (
        process.platform === "win32"
            ? "yt-dlp.exe"
            : "yt-dlp"
    );
};

/*
|--------------------------------------------------------------------------
| Check yt-dlp installation
|--------------------------------------------------------------------------
*/

export const checkYtDlp = async () => {
    const command = getYtDlpCommand();

    try {
        const { stdout } = await execFileAsync(
            command,
            ["--version"],
            {
                windowsHide: true
            }
        );

        return {
            installed: true,
            command,
            version: stdout.trim()
        };
    } catch (error) {
        if (error.code === "ENOENT") {
            return {
                installed: false,
                command,
                version: null,
                error:
                    "yt-dlp was not found. Install yt-dlp and make sure it is available in PATH, or set YTDLP_PATH in .env."
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
| Get YouTube video information
|--------------------------------------------------------------------------
*/

export const getVideoInfo = async (url) => {
    if (!isValidYouTubeUrl(url)) {
        throw new Error("Invalid YouTube URL.");
    }

    const command = getYtDlpCommand();

    try {
        const { stdout } = await execFileAsync(
            command,
            [
                "--dump-single-json",
                "--no-playlist",
                "--no-warnings",
                "--skip-download",
                url
            ],
            {
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024
            }
        );

        const data = JSON.parse(stdout);

        return {
            id: data.id,
            title: data.title,
            description: data.description || "",
            duration: data.duration || 0,
            durationString: data.duration_string || null,
            uploader: data.uploader || null,
            channelId: data.channel_id || null,
            thumbnail: data.thumbnail || null,
            webpageUrl: data.webpage_url || url,
            uploadDate: data.upload_date || null,
            viewCount: data.view_count || 0
        };
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(
                "yt-dlp is not installed or cannot be found. Install yt-dlp and add it to PATH."
            );
        }

        const stderr = error.stderr?.trim();

        throw new Error(
            stderr ||
            error.message ||
            "Unable to retrieve YouTube video information."
        );
    }
};

export default {
    isValidYouTubeUrl,
    checkYtDlp,
    getVideoInfo
};



/*
|--------------------------------------------------------------------------
| Get captions / transcript
|--------------------------------------------------------------------------
*/


const createTempDirectory = async () => {
    const directory = path.join(
        os.tmpdir(),
        `ai-video-learning-${crypto.randomUUID()}`
    );

    await fs.mkdir(directory, {
        recursive: true
    });

    return directory;
};

/*
|--------------------------------------------------------------------------
| Parse VTT timestamp
|--------------------------------------------------------------------------
*/

const parseTimestamp = (timestamp) => {
    const parts = timestamp.split(":");

    if (parts.length === 3) {
        const hours = Number(parts[0]);
        const minutes = Number(parts[1]);
        const seconds = Number(parts[2].replace(",", "."));

        return hours * 3600 + minutes * 60 + seconds;
    }

    if (parts.length === 2) {
        const minutes = Number(parts[0]);
        const seconds = Number(parts[1].replace(",", "."));

        return minutes * 60 + seconds;
    }

    return 0;
};

/*
|--------------------------------------------------------------------------
| Clean VTT transcript
|--------------------------------------------------------------------------
*/

const parseVTT = (vtt) => {
    const lines = vtt.split(/\r?\n/);

    const transcript = [];

    let currentText = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (currentText.length > 0) {
                transcript.push(currentText.join(" "));
                currentText = [];
            }

            continue;
        }

        /*
        Skip VTT headers
        */

        if (
            line === "WEBVTT" ||
            line.startsWith("NOTE") ||
            line.startsWith("STYLE") ||
            line.startsWith("REGION")
        ) {
            continue;
        }

        /*
        Skip cue identifiers
        */

        if (
            !line.includes("-->") &&
            /^[0-9]+$/.test(line)
        ) {
            continue;
        }

        /*
        Timestamp line
        */

        if (line.includes("-->")) {
            continue;
        }

        /*
        Remove VTT tags
        */

        const cleaned = line
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .trim();

        if (cleaned) {
            currentText.push(cleaned);
        }
    }

    if (currentText.length > 0) {
        transcript.push(currentText.join(" "));
    }

    /*
    Remove duplicate consecutive caption lines.
    */

    const uniqueLines = [];

    for (const line of transcript) {
        if (
            uniqueLines.length === 0 ||
            uniqueLines[uniqueLines.length - 1] !== line
        ) {
            uniqueLines.push(line);
        }
    }

    return uniqueLines
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
};

/*
|--------------------------------------------------------------------------
| Download transcript
|--------------------------------------------------------------------------
*/

export const getTranscript = async (url) => {
    if (!isValidYouTubeUrl(url)) {
        throw new Error("Invalid YouTube URL.");
    }

    const command = getYtDlpCommand();

    const tempDirectory = await createTempDirectory();

    try {
        const outputTemplate = path.join(
            tempDirectory,
            "captions.%(ext)s"
        );

        await execFileAsync(
            command,
            [
                "--write-auto-subs",
                "--write-subs",

                "--sub-langs",
                "en,en-US,en-GB",

                "--sub-format",
                "vtt",

                "--skip-download",
                "--no-playlist",
                "--no-warnings",

                "-o",
                outputTemplate,

                url
            ],
            {
                windowsHide: true,
                maxBuffer: 20 * 1024 * 1024
            }
        );

        const files = await fs.readdir(tempDirectory);

        const subtitleFile = files.find(
            (file) =>
                file.endsWith(".vtt") &&
                (
                    file.includes(".en.") ||
                    file.includes(".en-US.") ||
                    file.includes(".en-GB.")
                )
        );

        if (!subtitleFile) {
            throw new Error(
                "No English transcript/captions were found for this video."
            );
        }

        const subtitlePath = path.join(
            tempDirectory,
            subtitleFile
        );

        const vtt = await fs.readFile(
            subtitlePath,
            "utf8"
        );

        const transcript = parseVTT(vtt);

        if (!transcript || transcript.length < 20) {
            throw new Error(
                "The transcript was empty or too short."
            );
        }

        return {
            transcript,
            characterCount: transcript.length,
            wordCount: transcript.split(/\s+/).length
        };

    } catch (error) {

        if (error.code === "ENOENT") {
            throw new Error(
                "yt-dlp was not found. Make sure yt-dlp is installed and available in PATH."
            );
        }

        throw new Error(
            error.message ||
            "Unable to extract transcript."
        );

    } finally {

        /*
        Always remove temporary caption files.
        */

        await fs.rm(
            tempDirectory,
            {
                recursive: true,
                force: true
            }
        );
    }
};