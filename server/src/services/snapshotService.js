import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

/*
 * Safety limit.
 *
 * This is NOT the target number of snapshots.
 * A video can produce 60, 100, 150 etc. distinct snapshots.
 */
const MAX_SNAPSHOTS = 200;

/*
 * How visually different two frames need to be
 * before we consider them different.
 *
 * Lower = more snapshots
 * Higher = fewer snapshots
 */
const DIFFERENCE_THRESHOLD = 0.12;

/*
 * Prevent two snapshots from being too close together.
 */
const MIN_SNAPSHOT_GAP = 3;

/*
 * Reject frames whose average brightness is
 * below this value.
 *
 * 0   = completely black
 * 255 = completely white
 */
const MIN_BRIGHTNESS = 20;

/*
|--------------------------------------------------------------------------
| FFmpeg
|--------------------------------------------------------------------------
*/

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
| Adaptive sampling
|--------------------------------------------------------------------------
|
| Shorter videos:
| more frequent sampling
|
| Longer videos:
| less frequent sampling
|
|--------------------------------------------------------------------------
*/

const getSampleInterval = (duration = 0) => {
    if (duration <= 20 * 60) {
        return 3;
    }

    if (duration <= 60 * 60) {
        return 5;
    }

    if (duration <= 120 * 60) {
        return 7;
    }

    return 10;
};

/*
|--------------------------------------------------------------------------
| Create temporary snapshot directory
|--------------------------------------------------------------------------
*/

const createSnapshotDirectory = async () => {
    const directory = path.join(
        process.cwd(),
        "temp",
        `snapshots-${crypto.randomUUID()}`
    );

    await fs.mkdir(directory, {
        recursive: true
    });

    return directory;
};

/*
|--------------------------------------------------------------------------
| Create visual hash
|--------------------------------------------------------------------------
|
| Resize image to 16x16 grayscale.
|
| This gives us a compact representation of the
| visual content of the frame.
|--------------------------------------------------------------------------
*/

const createImageHash = async (imagePath) => {
    const { data } = await sharp(imagePath)
        .resize(16, 16, {
            fit: "fill"
        })
        .grayscale()
        .raw()
        .toBuffer({
            resolveWithObject: true
        });

    return data;
};

/*
|--------------------------------------------------------------------------
| Calculate visual difference
|--------------------------------------------------------------------------
*/

const calculateDifference = (hashA, hashB) => {
    if (
        !hashA ||
        !hashB ||
        hashA.length !== hashB.length
    ) {
        return 1;
    }

    let totalDifference = 0;

    for (let i = 0; i < hashA.length; i++) {
        totalDifference += Math.abs(
            hashA[i] - hashB[i]
        );
    }

    const maxDifference =
        255 * hashA.length;

    return (
        totalDifference /
        maxDifference
    );
};

/*
|--------------------------------------------------------------------------
| Calculate image brightness
|--------------------------------------------------------------------------
|
| Uses a small grayscale representation.
|--------------------------------------------------------------------------
*/

const getImageBrightness = async (imagePath) => {
    const { data } = await sharp(imagePath)
        .resize(16, 16, {
            fit: "fill"
        })
        .grayscale()
        .raw()
        .toBuffer({
            resolveWithObject: true
        });

    if (!data.length) {
        return 0;
    }

    let total = 0;

    for (const value of data) {
        total += value;
    }

    return total / data.length;
};

/*
|--------------------------------------------------------------------------
| Extract candidate frames
|--------------------------------------------------------------------------
*/

const extractCandidateFrames = async (
    videoPath,
    outputDirectory,
    duration
) => {
    const ffmpeg =
        getFfmpegCommand();

    const sampleInterval =
        getSampleInterval(duration);

    const outputPattern = path.join(
        outputDirectory,
        "frame-%06d.jpg"
    );

    console.log(
        `Using ${sampleInterval}s frame sampling interval.`
    );

    console.log(
        "Extracting candidate frames..."
    );

    await execFileAsync(
        ffmpeg,
        [
            "-i",
            videoPath,

            "-vf",
            `fps=1/${sampleInterval},scale=1280:-2`,

            "-q:v",
            "3",

            "-y",

            outputPattern
        ],
        {
            windowsHide: true,
            maxBuffer:
                20 * 1024 * 1024
        }
    );

    const files =
        await fs.readdir(
            outputDirectory
        );

    return files
        .filter((file) =>
            /^frame-\d+\.jpg$/i.test(file)
        )
        .sort()
        .map((file, index) => ({
            path: path.join(
                outputDirectory,
                file
            ),

            timestamp:
                index * sampleInterval
        }));
};

/*
|--------------------------------------------------------------------------
| Select visually distinct frames
|--------------------------------------------------------------------------
*/

const selectDistinctFrames =
    async (candidateFrames) => {

        const selected = [];

        let previousHash = null;

        let lastSelectedTimestamp =
            -Infinity;

        for (
            const candidate
            of candidateFrames
        ) {

            /*
            Safety limit.
            */

            if (
                selected.length >=
                MAX_SNAPSHOTS
            ) {
                console.log(
                    `Reached safety limit of ${MAX_SNAPSHOTS} snapshots.`
                );

                break;
            }

            /*
            ------------------------------------------------------------
            Check brightness
            ------------------------------------------------------------
            */

            const brightness =
                await getImageBrightness(
                    candidate.path
                );

            /*
            Skip black / extremely dark frames.
            */

            if (
                brightness <
                MIN_BRIGHTNESS
            ) {
                continue;
            }

            /*
            ------------------------------------------------------------
            Create visual hash
            ------------------------------------------------------------
            */

            const currentHash =
                await createImageHash(
                    candidate.path
                );

            /*
            ------------------------------------------------------------
            Always keep first valid frame
            ------------------------------------------------------------
            */

            if (!previousHash) {

                selected.push({
                    path:
                        candidate.path,

                    timestamp:
                        candidate.timestamp,

                    hash:
                        currentHash,

                    brightness
                });

                previousHash =
                    currentHash;

                lastSelectedTimestamp =
                    candidate.timestamp;

                continue;
            }

            /*
            ------------------------------------------------------------
            Calculate visual difference
            ------------------------------------------------------------
            */

            const difference =
                calculateDifference(
                    previousHash,
                    currentHash
                );

            /*
            ------------------------------------------------------------
            Minimum time gap
            ------------------------------------------------------------
            */

            const enoughTimePassed =
                candidate.timestamp -
                lastSelectedTimestamp >=
                MIN_SNAPSHOT_GAP;

            /*
            ------------------------------------------------------------
            Accept frame
            ------------------------------------------------------------
            */

            if (
                difference >=
                    DIFFERENCE_THRESHOLD &&
                enoughTimePassed
            ) {

                selected.push({
                    path:
                        candidate.path,

                    timestamp:
                        candidate.timestamp,

                    hash:
                        currentHash,

                    difference,

                    brightness
                });

                previousHash =
                    currentHash;

                lastSelectedTimestamp =
                    candidate.timestamp;
            }
        }

        return selected;
    };

/*
|--------------------------------------------------------------------------
| Create final snapshot images
|--------------------------------------------------------------------------
*/

export const extractDistinctSnapshots =
    async (
        videoPath,
        duration = 0
    ) => {

        const directory =
            await createSnapshotDirectory();

        try {

            /*
            ------------------------------------------------------------
            Extract candidates
            ------------------------------------------------------------
            */

            const candidates =
                await extractCandidateFrames(
                    videoPath,
                    directory,
                    duration
                );

            console.log(
                `Candidate frames: ${candidates.length}`
            );

            if (
                candidates.length === 0
            ) {
                throw new Error(
                    "FFmpeg could not extract any frames."
                );
            }

            /*
            ------------------------------------------------------------
            Select distinct frames
            ------------------------------------------------------------
            */

            const selected =
                await selectDistinctFrames(
                    candidates
                );

            console.log(
                `Distinct frames selected: ${selected.length}`
            );

            /*
            ------------------------------------------------------------
            Create final snapshots
            ------------------------------------------------------------
            */

            const finalSnapshots = [];

            for (
                let index = 0;
                index < selected.length;
                index++
            ) {

                const selectedFrame =
                    selected[index];

                const source =
                    selectedFrame.path;

                const finalPath =
                    path.join(
                        directory,
                        `snapshot-${String(
                            index + 1
                        ).padStart(4, "0")}.jpg`
                    );

                await sharp(source)
                    .jpeg({
                        quality: 85
                    })
                    .toFile(
                        finalPath
                    );

                finalSnapshots.push({
                    index:
                        index + 1,

                    path:
                        finalPath,

                    timestamp:
                        selectedFrame.timestamp,

                    difference:
                        selectedFrame.difference ??
                        null
                });
            }

            /*
            ------------------------------------------------------------
            Return result
            ------------------------------------------------------------
            */

            return {
                directory,

                sampleInterval:
                    getSampleInterval(
                        duration
                    ),

                candidateCount:
                    candidates.length,

                selectedCount:
                    finalSnapshots.length,

                snapshots:
                    finalSnapshots
            };

        } catch (error) {

            /*
            Always clean up on failure.
            */

            await fs.rm(
                directory,
                {
                    recursive: true,
                    force: true
                }
            );

            throw error;
        }
    };