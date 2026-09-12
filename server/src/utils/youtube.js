import { execFile } from "child_process";
import { promisify } from "util";
import validator from "validator";

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