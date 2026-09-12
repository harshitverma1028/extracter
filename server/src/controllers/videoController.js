import {
    isValidYouTubeUrl,
    checkYtDlp,
    getVideoInfo
} from "../utils/youtube.js";

/*
|--------------------------------------------------------------------------
| GET /api/videos/tool-status
|--------------------------------------------------------------------------
*/

export const getToolStatus = async (req, res) => {
    const ytDlp = await checkYtDlp();

    res.status(200).json({
        success: true,
        tools: {
            ytDlp
        }
    });
};

/*
|--------------------------------------------------------------------------
| POST /api/videos/validate
|--------------------------------------------------------------------------
*/

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