import { describe, expect, it } from "vitest"

import { apiMessageContent, attachmentKind, type ChatAttachment } from "./attachments"

const attachment = (value: Partial<ChatAttachment> & Pick<ChatAttachment, "kind">): ChatAttachment => ({
  id: "a1",
  name: "sample.dat",
  mimeType: "application/octet-stream",
  size: 1,
  ...value,
})

describe("attachmentKind", () => {
  it("recognizes text and audio by extension when MIME is absent", () => {
    expect(attachmentKind({ name: "notes.md", type: "" } as File)).toBe("text")
    expect(attachmentKind({ name: "voice.flac", type: "" } as File)).toBe("audio")
  })

  it("recognizes browser MIME families", () => {
    expect(attachmentKind({ name: "photo", type: "image/png" } as File)).toBe("image")
    expect(attachmentKind({ name: "clip", type: "video/mp4" } as File)).toBe("video")
  })
})

describe("apiMessageContent", () => {
  it("keeps plain messages as strings", () => {
    expect(apiMessageContent("hello")).toBe("hello")
  })

  it("maps all supported attachment kinds to model input parts", () => {
    const content = apiMessageContent("question", [
      attachment({ kind: "image", name: "x.png", mimeType: "image/png", data: "abc" }),
      attachment({ kind: "video", name: "x.mp4", mimeType: "video/mp4", data: "def" }),
      attachment({ kind: "audio", name: "x.wav", transcript: "recognized speech" }),
      attachment({ kind: "text", name: "x.txt", text: "file body" }),
    ])
    expect(content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      { type: "input_video", input_video: { data: "def", format: "mp4" } },
      { type: "text", text: expect.stringContaining("recognized speech") },
      { type: "text", text: expect.stringContaining("file body") },
      { type: "text", text: "question" },
    ])
  })
})
