// -----------------------------------------------------------------------------
// ExcalidrawVideoElement & related helpers
//
// Mirrors `image.ts`: a cache of decoded `HTMLVideoElement`s keyed by `FileId`,
// populated from the same `BinaryFiles` map images use. The live `<video>` is
// rendered as a DOM overlay (see App.tsx `renderVideos`); this cache feeds the
// canvas paint (export / static frame) via `context.drawImage(video, ...)`.
// -----------------------------------------------------------------------------

import { MIME_TYPES, type VIDEO_MIME_TYPES } from "@excalidraw/common";

import type {
  AppClassProperties,
  DataURL,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

import type { ValueOf } from "@excalidraw/common/utility-types";

import { isInitializedVideoElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  FileId,
  InitializedExcalidrawVideoElement,
} from "./types";

export const loadHTMLVideoElement = (
  dataURL: DataURL,
): Promise<HTMLVideoElement> => {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    // `loadeddata` fires once the first frame is available — enough to draw a
    // poster frame and to read `videoWidth`/`videoHeight`. We don't preload the
    // whole file.
    video.preload = "metadata";
    video.onloadeddata = () => {
      resolve(video);
    };
    video.onerror = (error) => {
      reject(error);
    };
    video.src = dataURL;
  });
};

/** NOTE: updates cache even if already populated with given video. Thus,
 * you should filter out the videos upstream if you want to optimize this. */
export const updateVideoCache = async ({
  fileIds,
  files,
  videoCache,
}: {
  fileIds: FileId[];
  files: BinaryFiles;
  videoCache: AppClassProperties["videoCache"];
}) => {
  const updatedFiles = new Map<FileId, true>();
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    fileIds.reduce((promises, fileId) => {
      const fileData = files[fileId as string];
      if (fileData && !updatedFiles.has(fileId)) {
        updatedFiles.set(fileId, true);
        return promises.concat(
          (async () => {
            try {
              if (fileData.mimeType === MIME_TYPES.binary) {
                throw new Error("Only videos can be added to VideoCache");
              }

              const videoPromise = loadHTMLVideoElement(fileData.dataURL);
              const data = {
                video: videoPromise,
                mimeType: fileData.mimeType as ValueOf<typeof VIDEO_MIME_TYPES>,
              } as const;
              // store the promise immediately to indicate there's an in-progress
              // initialization
              videoCache.set(fileId, data);

              const video = await videoPromise;

              videoCache.set(fileId, { ...data, video });
            } catch (error: any) {
              erroredFiles.set(fileId, true);
            }
          })(),
        );
      }
      return promises;
    }, [] as Promise<any>[]),
  );

  return {
    videoCache,
    /** includes errored files because they cache was updated nonetheless */
    updatedFiles,
    /** files that failed when creating HTMLVideoElement */
    erroredFiles,
  };
};

export const getInitializedVideoElements = (
  elements: readonly ExcalidrawElement[],
) =>
  elements.filter((element) =>
    isInitializedVideoElement(element),
  ) as InitializedExcalidrawVideoElement[];
