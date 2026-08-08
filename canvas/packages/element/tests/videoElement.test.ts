import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import { newVideoElement } from "../src/newElement";
import { getInitializedVideoElements } from "../src/video";
import {
  isImageElement,
  isInitializedVideoElement,
  isVideoElement,
} from "../src/typeChecks";

import type { ExcalidrawVideoElement, NonDeleted } from "../src/types";

describe("ExcalidrawVideoElement", () => {
  it("newVideoElement defaults to pending status and null fileId", () => {
    const video = newVideoElement({
      type: "video",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });

    expect(video.type).toBe("video");
    expect(video.status).toBe("pending");
    expect(video.fileId).toBe(null);
    // video frames are transparent (like image) so the <video> shows through
    expect(video.strokeColor).toBe("transparent");
  });

  it("isVideoElement recognizes video and rejects other types", () => {
    const video = API.createElement({
      type: "video",
      fileId: "file_V",
      width: 10,
      height: 10,
    }) as NonDeleted<ExcalidrawVideoElement>;
    const image = API.createElement({
      type: "image",
      fileId: "file_I",
      width: 10,
      height: 10,
    });
    const rect = API.createElement({
      type: "rectangle",
      width: 10,
      height: 10,
    });

    expect(isVideoElement(video)).toBe(true);
    expect(isVideoElement(image)).toBe(false);
    expect(isVideoElement(rect)).toBe(false);
    // a video is not an image, even though they share the fileId/storage pattern
    expect(isImageElement(video)).toBe(false);
  });

  it("isInitializedVideoElement requires a non-pending status and a fileId", () => {
    const pending = newVideoElement({
      type: "video",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const savedWithFile = API.createElement({
      type: "video",
      fileId: "file_V",
      width: 10,
      height: 10,
    }) as NonDeleted<ExcalidrawVideoElement>;
    const savedNoFile = newVideoElement({
      type: "video",
      status: "saved",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });

    expect(isInitializedVideoElement(pending)).toBe(false);
    expect(isInitializedVideoElement(savedWithFile)).toBe(true);
    expect(isInitializedVideoElement(savedNoFile)).toBe(false);
  });

  it("getInitializedVideoElements filters out pending / fileless videos", () => {
    const elements = [
      API.createElement({
        type: "video",
        fileId: "file_V",
        width: 10,
        height: 10,
      }),
      newVideoElement({ type: "video", x: 0, y: 0, width: 10, height: 10 }),
      API.createElement({ type: "rectangle", width: 10, height: 10 }),
    ];

    const initialized = getInitializedVideoElements(elements);
    expect(initialized).toHaveLength(1);
    expect(initialized[0].fileId).toBe("file_V");
  });
});
