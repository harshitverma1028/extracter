import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

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
| Configuration
|--------------------------------------------------------------------------
*/

const SAMPLE_INTERVAL = 5;

const MAX_SNAPSHOTS = 20;

const DIFFERENCE_THRESHOLD = 0.12;

/*
|--------------------------------------------------------------------------
| Create directory
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
| Convert image into perceptual-style hash
|--------------------------------------------------------------------------
|
| We resize the image to 16x16 grayscale.
|
| This gives us 256 values.
|
| Similar frames → similar values.
|
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
| Calculate difference between two images
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

    /*
    Maximum possible difference:
    255 × number of pixels
    */

    const maxDifference =
        255 * hashA.length;

    return (
        totalDifference /
        maxDifference
    );
};

/*
|--------------------------------------------------------------------------
| Extract candidate frames
|--------------------------------------------------------------------------
*/

const extractCandidateFrames = async (
    videoPath,
    outputDirectory
) => {

    const ffmpeg =
        getFfmpegCommand();

    const outputPattern =
    path.join(
        outputDirectory,
        "frame-%04d.jpg"
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
            `fps=1/${SAMPLE_INTERVAL},scale=1280:-2`,

            "-q:v",
            "3",

            "-y",

            outputPattern
        ],
        {
            windowsHide: true,
            maxBuffer: 20 * 1024 * 1024
        }
    );

    const files =
        await fs.readdir(
            outputDirectory
        );

    return files
    .filter((file) =>
        file.endsWith(".jpg")
    )
    .sort()
    .map((file, index) => ({
        path: path.join(
            outputDirectory,
            file
        ),

        timestamp:
            index * SAMPLE_INTERVAL
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

        for (
            const candidate
            of candidateFrames
        ) {

            const currentHash =
                await createImageHash(
                    candidate.path
                );

            /*
            Always keep first frame.
            */

            if (!previousHash) {

                selected.push({
                    path: candidate.path,
                    hash: currentHash,
                    timestamp: candidate.timestamp,
                    hash: currentHash

                });

                previousHash =
                    currentHash;

                continue;
            }

            const difference =
                calculateDifference(
                    previousHash,
                    currentHash
                );

            /*
            Keep only visually different
            frames.
            */

            if (
                difference >=
                DIFFERENCE_THRESHOLD
            ) {

                selected.push({
                    path: candidate.path,
                    hash: currentHash,
                    timestamp: candidate.timestamp,
                    hash: currentHash,
                    difference
                });

                previousHash =
                    currentHash;
            }

            /*
            Stop at maximum.
            */

            if (
                selected.length >=
                MAX_SNAPSHOTS
            ) {
                break;
            }
        }

        return selected;
    };

/*
|--------------------------------------------------------------------------
| Create final snapshots
|--------------------------------------------------------------------------
*/

export const extractDistinctSnapshots =
    async (videoPath) => {

        const directory =
            await createSnapshotDirectory();

        try {

            const candidates =
                await extractCandidateFrames(
                    videoPath,
                    directory
                );

            console.log(
                `Candidate frames: ${candidates.length}`
            );

            if (candidates.length === 0) {
                throw new Error(
                    "FFmpeg could not extract any frames."
                );
            }

            const selected =
                await selectDistinctFrames(
                    candidates
                );

            console.log(
                `Distinct frames selected: ${selected.length}`
            );

            const finalSnapshots = [];

            for (
                let index = 0;
                index < selected.length;
                index++
            ) {

                const source =
                    selected[index].path;

                const finalPath =
                    path.join(
                        directory,
                        `snapshot-${index + 1}.jpg`
                    );

                await sharp(source)
                    .jpeg({
                        quality: 85
                    })
                    .toFile(finalPath);

                finalSnapshots.push({
                    index: index + 1,
                    path: finalPath,
                    timestamp:
                        selected[index].timestamp
                });
            }

            return {
                directory,
                snapshots: finalSnapshots
            };

        } catch (error) {

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