import {
    summarizeChunk,
    synthesizeSummary,
    parseSummaryResponse
} from "./aiService.js";

import {
    chunkTranscript
} from "../utils/text.js";

/*
|--------------------------------------------------------------------------
| Generate complete video summary
|--------------------------------------------------------------------------
*/

export const generateVideoSummary =
    async (
        transcript,
        onProgress = () => {}
    ) => {

        if (
            !transcript ||
            transcript.trim().length < 20
        ) {
            throw new Error(
                "Transcript is too short to summarize."
            );
        }

        /*
        ---------------------------------------------------------------
        Split transcript
        ---------------------------------------------------------------
        */

        const chunks =
            chunkTranscript(
                transcript,
                12000
            );

        if (!chunks.length) {
            throw new Error(
                "Unable to split transcript into chunks."
            );
        }

        console.log(
            `Transcript chunks: ${chunks.length}`
        );

        /*
        ---------------------------------------------------------------
        Summarize each chunk
        ---------------------------------------------------------------
        */

        const chunkSummaries = [];

        for (
            let index = 0;
            index < chunks.length;
            index++
        ) {

            console.log(
                `Summarizing chunk ${
                    index + 1
                }/${chunks.length}...`
            );

            onProgress({
                stage:
                    "summarizing",

                current:
                    index + 1,

                total:
                    chunks.length
            });

            const summary =
                await summarizeChunk(
                    chunks[index],
                    index + 1,
                    chunks.length
                );

            chunkSummaries.push(
                summary
            );
        }

        /*
        ---------------------------------------------------------------
        Final synthesis
        ---------------------------------------------------------------
        */

        console.log(
            "Creating final video summary..."
        );

        onProgress({
            stage:
                "synthesizing"
        });

        const finalResponse =
            await synthesizeSummary(
                chunkSummaries
            );

        const parsed =
            parseSummaryResponse(
                finalResponse
            );

        return {
            summary:
                parsed.summary,

            importantPoints:
                parsed.importantPoints,

            chunkCount:
                chunks.length
        };
    };