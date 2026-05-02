import { describe, it, expect, vi } from "vitest";
import { serializeProject, deserializeProject, downloadProjectFile } from "./projectSerializer";

describe("serializeProject", () => {
  it("wraps daw state in project envelope", () => {
    const state = { project: { name: "Test" }, transport: { bpm: 140 } };
    const result = serializeProject(state);
    expect(result.format).toBe("openstudio-project");
    expect(result.version).toBe(1);
    expect(result.savedAt).toBeDefined();
    expect(result.daw.project).toEqual(state.project);
    expect(result.daw.transport.bpm).toBe(140);
  });

  it("resets transport playback flags", () => {
    const state = {
      transport: { isPlaying: true, isRecording: true, currentStep16: 8 },
    };
    const result = serializeProject(state);
    expect(result.daw.transport.isPlaying).toBe(false);
    expect(result.daw.transport.isRecording).toBe(false);
    expect(result.daw.transport.currentStep16).toBe(0);
  });

  it("deep clones state so original is not mutated", () => {
    const state = { project: { name: "Test" } };
    const result = serializeProject(state);
    result.daw.project.name = "Mutated";
    expect(state.project.name).toBe("Test");
  });
});

describe("deserializeProject", () => {
  it("extracts daw object from serialized envelope", () => {
    const data = { format: "openstudio-project", daw: { project: {}, transport: {} } };
    const result = deserializeProject(data);
    expect(result).toEqual(data.daw);
  });

  it("accepts raw daw object without envelope", () => {
    const data = { project: {}, transport: {} };
    const result = deserializeProject(data);
    expect(result).toEqual(data);
  });

  it("throws for null data", () => {
    expect(() => deserializeProject(null)).toThrow("Invalid project data");
  });

  it("throws for non-object data", () => {
    expect(() => deserializeProject("string")).toThrow("Invalid project data");
  });

  it("throws for invalid structure", () => {
    expect(() => deserializeProject({ daw: { project: {} } })).toThrow("Invalid project file structure");
    expect(() => deserializeProject({})).toThrow("Invalid project file structure");
  });
});

describe("downloadProjectFile", () => {
  it("creates download link with .os extension", () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => {});
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => {});
    const clickSpy = vi.fn();
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    createElementSpy.mockReturnValue({
      href: "",
      download: "",
      click: clickSpy,
    });

    downloadProjectFile({ format: "test" }, "MyProject");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it("does not duplicate .os extension", () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => {});
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => {});
    const link = { href: "", download: "", click: vi.fn() };
    createElementSpy.mockReturnValue(link);

    downloadProjectFile({ format: "test" }, "MyProject.os");
    expect(link.download).toBe("MyProject.os");

    createElementSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
