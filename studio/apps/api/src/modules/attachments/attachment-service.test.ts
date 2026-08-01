import { describe, expect, it } from "vitest"

import { attachmentKind } from "./attachment-service.js"

describe("attachmentKind", () => {
  it("recognizes every supported multimodal category", () => {
    expect(attachmentKind("photo.png", "image/png")).toBe("image")
    expect(attachmentKind("clip.mp4", "video/mp4")).toBe("video")
    expect(attachmentKind("voice.opus", "application/octet-stream")).toBe("audio")
    expect(attachmentKind("source.ts", "application/octet-stream")).toBe("text")
  })

  it("rejects an opaque binary", () => {
    expect(() => attachmentKind("archive.bin", "application/octet-stream")).toThrow("Unsupported file type")
  })
})
