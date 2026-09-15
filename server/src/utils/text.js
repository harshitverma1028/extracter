

export const chunkTranscript = (
    transcript,
    maxCharacters = 12000
) => {

    if (!transcript) {
        return [];
    }

    const sentences =
        transcript
            .match(
                /[^.!?]+[.!?]+|[^.!?]+$/g
            )
            ?.map(
                (sentence) =>
                    sentence.trim()
            )
            .filter(Boolean) || [];

    const chunks = [];

    let currentChunk = "";

    for (
        const sentence
        of sentences
    ) {

        if (
            currentChunk.length +
            sentence.length +
            1 <=
            maxCharacters
        ) {

            currentChunk +=
                `${sentence} `;

        } else {

            if (
                currentChunk.trim()
            ) {
                chunks.push(
                    currentChunk.trim()
                );
            }

            /*
            Handle an individual sentence
            larger than maxCharacters.
            */

            if (
                sentence.length >
                maxCharacters
            ) {

                for (
                    let i = 0;
                    i < sentence.length;
                    i += maxCharacters
                ) {

                    chunks.push(
                        sentence.slice(
                            i,
                            i + maxCharacters
                        )
                    );
                }

                currentChunk = "";

            } else {

                currentChunk =
                    `${sentence} `;
            }
        }
    }

    if (
        currentChunk.trim()
    ) {
        chunks.push(
            currentChunk.trim()
        );
    }

    return chunks;
};