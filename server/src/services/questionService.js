import {
    generateQuestionsFromChunk,
    synthesizeQuestions
} from "./aiService.js";

import { chunkTranscript } from "../utils/text.js";

export const generateVideoQuestions = async (
    transcript,
    onProgress = () => {}
) => {
    if (!transcript || transcript.trim().length < 20) {
        throw new Error(
            "Transcript is too short to generate questions."
        );
    }

    const chunks = chunkTranscript(
        transcript,
        12000
    );

    if (!chunks.length) {
        throw new Error(
            "Unable to split transcript into chunks."
        );
    }

    console.log(
        `Question generation chunks: ${chunks.length}`
    );

    const questionSets = [];

    for (let index = 0; index < chunks.length; index++) {
        console.log(
            `Generating questions ${index + 1}/${chunks.length}...`
        );

        onProgress({
            stage: "generating_questions",
            current: index + 1,
            total: chunks.length
        });

        const questions =
            await generateQuestionsFromChunk(
                chunks[index],
                index + 1,
                chunks.length
            );

        questionSets.push(questions);
    }

    console.log(
        "Creating final question set..."
    );

    onProgress({
        stage: "synthesizing_questions"
    });

    const finalQuestions =
        await synthesizeQuestions(questionSets);

    return {
        questions: finalQuestions,
        chunkCount: chunks.length
    };
};