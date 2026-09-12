import PDFDocument from "pdfkit";
import fs from "fs";

const formatTimestamp = (seconds) => {

    const totalSeconds =
        Math.floor(seconds);

    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const secs =
        totalSeconds % 60;

    if (hours > 0) {
        return [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(secs).padStart(2, "0")
        ].join(":");
    }

    return [
        String(minutes).padStart(2, "0"),
        String(secs).padStart(2, "0")
    ].join(":");
};

/*
|--------------------------------------------------------------------------
| Generate snapshot PDF
|--------------------------------------------------------------------------
*/

export const generateSnapshotPDF = ({
    videoTitle,
    videoUrl,
    snapshots,
    outputPath
}) => {

    return new Promise((resolve, reject) => {

        const doc =
            new PDFDocument({
                size: "A4",
                margin: 45
            });

        const stream =
            fs.createWriteStream(
                outputPath
            );

        doc.pipe(stream);

        /*
        ---------------------------------------------------------------
        Cover / header
        ---------------------------------------------------------------
        */

        doc
            .fontSize(24)
            .font("Helvetica-Bold")
            .text(
                "Video Learning Snapshots",
                {
                    align: "center"
                }
            );

        doc.moveDown(1);

        doc
            .fontSize(15)
            .font("Helvetica-Bold")
            .text(
                videoTitle ||
                "YouTube Video"
            );

        doc.moveDown(0.5);

        doc
            .fontSize(9)
            .font("Helvetica")
            .fillColor("#555555")
            .text(videoUrl);

        doc.fillColor("#000000");

        doc.moveDown(1);

        doc
            .fontSize(10)
            .text(
                `Distinct snapshots: ${snapshots.length}`
            );

        doc.moveDown(1.5);

        /*
        ---------------------------------------------------------------
        Snapshots
        ---------------------------------------------------------------
        */

        snapshots.forEach(
            (snapshot, index) => {

                doc.addPage();

                doc
                    .fontSize(16)
                    .font("Helvetica-Bold")
                    .text(
                        `Snapshot ${index + 1}`
                    );

                doc.moveDown(0.3);

                doc
                    .fontSize(10)
                    .font("Helvetica")
                    .fillColor("#555555")
                    .text(
                        `Timestamp: ${formatTimestamp(
                            snapshot.timestamp || 0
                        )}`
                    );

                doc.fillColor("#000000");

                doc.moveDown(1);

                /*
                Image dimensions
                */

                const imageWidth =
                    doc.page.width -
                    doc.page.margins.left -
                    doc.page.margins.right;

                const imageHeight =
                    doc.page.height -
                    doc.page.margins.top -
                    doc.page.margins.bottom -
                    100;

                doc.image(
                    snapshot.path,
                    doc.page.margins.left,
                    130,
                    {
                        fit: [
                            imageWidth,
                            imageHeight
                        ],
                        align: "center",
                        valign: "center"
                    }
                );

                doc
                    .fontSize(8)
                    .fillColor("#777777")
                    .text(
                        `Source: ${videoUrl}`,
                        doc.page.margins.left,
                        doc.page.height - 55,
                        {
                            width: imageWidth,
                            align: "center"
                        }
                    );

                doc.fillColor("#000000");
            }
        );

        doc.end();

        stream.on(
            "finish",
            () => resolve(outputPath)
        );

        stream.on(
            "error",
            reject
        );
    });
};