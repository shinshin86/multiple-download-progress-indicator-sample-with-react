import { useState } from "react";
import { Box, Button, Container, Input, Progress } from "@chakra-ui/react";

// types
type DownloadFile = {
  id: number;
  fileName: string;
  progressPercent: number;
  isFinished: boolean;
};

type DownloadPromiseFunc = {
  promise: Function;
  file: DownloadFile;
};

type DownloadPromises = Array<DownloadPromiseFunc>;

// const
const MAX_NUMBER_CONCURRENCIES: number = 3;
const TEST_IMAGE_URL = "http://localhost:3000/test-image.png";

// utils
const sleep = (msec: number): Promise<void> => new Promise(resolve => setTimeout(resolve, msec));

function App() {
  const [downloadCount, setDownloadCount] = useState(1);
  const [downloadFiles, setDownloadFiles] = useState<Array<DownloadFile>>([]);

  const getDownloadFiles = async (
    count: number,
  ): Promise<Array<DownloadFile>> => {
    if (!count) return [];

    const files = [];
    for (const index of [...Array(+count).keys()]) {
      const id = index + downloadFiles.length;
      const fileName = `test_${id}.png`;

      files.push({ id, fileName, progressPercent: 0, isFinished: false });
    }

    setDownloadFiles(files);
    return files;
  };

  const getUnderlyingSource = (
    downloadFile: DownloadFile,
    url: string,
  ): UnderlyingSource => {
    return {
      async start(controller) {
        const response = await fetch(url);

        // @ts-ignore
        const contentLength = +response.headers.get("Content-Length");
        // @ts-ignore
        let reader = response.body.getReader();
        let receivedLength = 0;

        const fetchImage = (): Promise<void> => {
          return reader.read().then(async ({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }

            receivedLength += value.length;
            controller.enqueue(value);

            const progressPercent = Math.round(
              (receivedLength / contentLength) * 100,
            );

            setDownloadFiles((pre) => {
              if (!pre) throw new Error("Not set downloadfiles");

              return pre.map((p) => {
                if (p.id === downloadFile.id) {
                  p.progressPercent = progressPercent;
                }

                return p;
              });
            });

            return fetchImage();
          });
        };

        return fetchImage();
      },
    };
  };

  const download = async (
    downloadFile: DownloadFile,
  ): Promise<DownloadFile> => {
    const underlyingSource = getUnderlyingSource(downloadFile, TEST_IMAGE_URL);
    const stream = new ReadableStream(underlyingSource);
    const reader = stream.getReader();

    let chunks = [];
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
    }

    // download
    const blob = new Blob(chunks);
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFile.fileName;
    document.body.appendChild(a);

    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    // update state (isFinished: true)
    setDownloadFiles((pre) => {
      return pre.map((p) => {
        if (p.id === downloadFile.id) {
          p.isFinished = true;
        }

        return p;
      });
    });

    // [issue]
    // If you do not allow a little interval, some files may not be downloaded in some cases.
    await sleep(300);

    return downloadFile;
  };

  const parallelDownload = async (promises: DownloadPromises) => {
    let i = 0;

    // Check the maximum number of downloads to be processed in parallel.
    const runPromises = ((limit: number) => {
      return () => {
        if (!promises.length && !i) {
          console.log("Finish!");
          return;
        }

        while (promises.length && i < limit) {
          ++i;

          const downloadPromise = promises.shift();
          if (!downloadPromise) {
            throw new Error("Invalid download promise");
          }

          const { promise, file } = downloadPromise;

          promise(file)
            .then((downloadFile: DownloadFile) => {
              console.log("Download file name: ", downloadFile.fileName);

              --i;

              runPromises();
            })
            .catch((error: any) => {
              console.error(error)
            });
        }
      };
    })(MAX_NUMBER_CONCURRENCIES);

    runPromises();
  };

  return (
    <Container>
      <Box padding="4">
        {downloadFiles.length > 0
          ? (
            downloadFiles.map((
              { fileName, progressPercent, isFinished },
              i,
            ) => (
              <div key={i}>
                <p>{fileName}</p>
                <Progress hasStripe value={progressPercent} />
                <div>{progressPercent}%{isFinished && " Finish!"}</div>
              </div>
            ))
          )
          : <div>Multiple download and progress indicator sample</div>}
      </Box>
      <Box padding="4">
        <Input
          type="number"
          onChange={(e) => setDownloadCount(Number(e.target.value))}
          value={downloadCount || ""}
        />
      </Box>
      <Box padding="4">
        <Button
          colorScheme={"blue"}
          disabled={!downloadCount}
          onClick={async () => {
            const files = await getDownloadFiles(downloadCount);

            const promises: DownloadPromises = [];
            for (const file of files) {
              promises.push({ promise: download, file });
            }

            await parallelDownload(promises);
          }}
        >
          Download
        </Button>
      </Box>
    </Container>
  );
}

export default App;