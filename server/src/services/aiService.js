import axios from "axios";

const getOllamaUrl = () => {
    return (
        process.env.OLLAMA_URL ||
        "http://127.0.0.1:11434"
    );
};

const getOllamaModel = () => {
    return (
        process.env.OLLAMA_MODEL ||
        "gemma3:4b"
    );
};


const callOllama = async (prompt) => {

    const url =
        `${getOllamaUrl()}/api/generate`;

    const response =
        await axios.post(
            url,
            {
                model:
                    getOllamaModel(),

                prompt,

                stream: false,

                options: {
                    temperature: 0.2
                }
            },
            {
                timeout:
                    5 * 60 * 1000
            }
        );

    if (
        !response.data ||
        !response.data.response
    ) {
        throw new Error(
            "Ollama returned an empty response."
        );
    }

    return response.data.response.trim();
};



export const checkAI = async () => {

    try {

        const response =
            await axios.get(
                `${getOllamaUrl()}/api/tags`,
                {
                    timeout: 10000
                }
            );

        const models =
            response.data?.models || [];

        const modelName =
            getOllamaModel();

        const installed =
            models.some(
                (model) =>
                    model.name === modelName ||
                    model.name.startsWith(
                        `${modelName}:`
                    )
            );

        return {
            provider: "ollama",

            available: true,

            model: modelName,

            modelInstalled:
                installed,

            models:
                models.map(
                    (model) =>
                        model.name
                )
        };

    } catch (error) {

        return {
            provider: "ollama",

            available: false,

            model:
                getOllamaModel(),

            modelInstalled: false,

            error:
                error.code ===
                "ECONNREFUSED"
                    ? "Ollama is not running."
                    : error.message
        };
    }
};



export const summarizeChunk =
    async (
        transcriptChunk,
        chunkNumber,
        totalChunks
    ) => {

        const prompt = `
You are an expert educational content summarizer.

You are analyzing part ${chunkNumber} of ${totalChunks}
of a longer educational video transcript.

Your task is to summarize ONLY the information
contained in this transcript section.

Rules:

1. Preserve important technical concepts.
2. Preserve definitions.
3. Preserve formulas or algorithms when present.
4. Preserve examples that help understanding.
5. Do not invent information.
6. Do not mention that this is a transcript.
7. Do not use unnecessary filler.
8. Write for a student who wants to learn the topic.

Return:

SUMMARY:
A clear detailed summary of this section.

IMPORTANT POINTS:
- Point 1
- Point 2
- Point 3
- Point 4
- Point 5

TRANSCRIPT SECTION:

${transcriptChunk}
`;

        return callOllama(prompt);
    };



export const synthesizeSummary =
    async (chunkSummaries) => {

        const combined =
            chunkSummaries
                .map(
                    (summary, index) =>
                        `
SECTION ${index + 1}

${summary}
`
                )
                .join("\n");

        const prompt = `
You are an expert educational content creator.

Below are summaries of different sections of a
complete educational video.

Create ONE unified learning summary covering
the entire video.

Important requirements:

1. Use information from ALL sections.
2. Do not focus only on the first section.
3. Remove repetition.
4. Preserve important technical details.
5. Preserve important definitions.
6. Preserve useful examples.
7. Organize the material logically.
8. Do not invent information.
9. Write in clear language suitable for a student.

Return EXACTLY this structure:

SUMMARY:
Write a comprehensive summary of the complete video
in several well-organized paragraphs.

IMPORTANT POINTS:
- Important point 1
- Important point 2
- Important point 3
- Important point 4
- Important point 5
- Important point 6
- Important point 7
- Important point 8
- Important point 9
- Important point 10

SECTION SUMMARIES:

${combined}
`;

        return callOllama(prompt);
    };



    export const generateQuestionsFromChunk = async (
    transcriptChunk,
    chunkNumber,
    totalChunks
) => {
    const prompt = `
You are an expert educational question generator.

You are analyzing part ${chunkNumber} of ${totalChunks}
of a longer educational video transcript.

Generate useful questions based ONLY on the information
contained in this section.

Rules:
1. Do not invent information.
2. Do not use information outside the transcript.
3. Test important concepts, definitions, examples, and understanding.
4. Avoid trivial questions.
5. Avoid duplicate questions.
6. Create exactly 5 multiple-choice questions.
7. Each question must have exactly 4 options.
8. Only ONE option must be correct.
9. Include a short explanation for the correct answer.
10. Mix easy, medium, and hard questions.

Return EXACTLY this JSON format:

[
  {
    "question": "Question text",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "answer": "Option A",
    "explanation": "Why this answer is correct.",
    "difficulty": "easy"
  }
]

TRANSCRIPT SECTION:

${transcriptChunk}
`;

    const response = await callOllama(prompt);

    // Remove possible markdown code fences
    const cleaned = response
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    try {
        const questions = JSON.parse(cleaned);

        if (!Array.isArray(questions)) {
            throw new Error("AI did not return an array.");
        }

        return questions;
    } catch (error) {
        console.error("Failed to parse AI questions:");
        console.error(response);

        throw new Error(
            "AI returned invalid question format."
        );
    }
};



export const synthesizeQuestions = async (questionSets) => {
    const combined = questionSets
        .flat()
        .map((question, index) => `
QUESTION ${index + 1}

Question:
${question.question}

Options:
${question.options.join("\n")}

Answer:
${question.answer}

Explanation:
${question.explanation}

Difficulty:
${question.difficulty}
`)
        .join("\n");

    const prompt = `
You are an expert educational assessment designer.

Below are questions generated from different sections
of a complete educational video.

Create a final question set covering the entire video.

Requirements:
1. Use information ONLY from the supplied questions.
2. Remove duplicate or nearly duplicate questions.
3. Maintain coverage of different concepts.
4. Keep the questions technically accurate.
5. Keep exactly 10 questions if enough unique questions exist.
6. Each question must have exactly 4 options.
7. Each question must have exactly one correct answer.
8. Include an explanation.
9. Include difficulty.
10. Return ONLY valid JSON.

Return exactly:

[
  {
    "question": "Question text",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "answer": "Option A",
    "explanation": "Explanation",
    "difficulty": "easy"
  }
]

GENERATED QUESTIONS:

${combined}
`;

    const response = await callOllama(prompt);

    const cleaned = response
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    try {
        const questions = JSON.parse(cleaned);

        if (!Array.isArray(questions)) {
            throw new Error("AI did not return an array.");
        }

        return questions.slice(0, 10);
    } catch (error) {
        console.error("Failed to parse final questions:");
        console.error(response);

        throw new Error(
            "AI returned invalid final question format."
        );
    }
};



export const parseSummaryResponse =
    (text) => {

        const summaryMatch =
            text.match(
                /SUMMARY:\s*([\s\S]*?)(?=\n\s*IMPORTANT POINTS:|$)/i
            );

        const pointsMatch =
            text.match(
                /IMPORTANT POINTS:\s*([\s\S]*)/i
            );

        const summary =
            summaryMatch
                ? summaryMatch[1].trim()
                : text.trim();

        let importantPoints = [];

        if (pointsMatch) {

            importantPoints =
                pointsMatch[1]
                    .split(/\r?\n/)
                    .map(
                        (line) =>
                            line
                                .replace(
                                    /^[-*•\d.)\s]+/,
                                    ""
                                )
                                .trim()
                    )
                    .filter(Boolean);
        }

        return {
            summary,
            importantPoints
        };
    };