import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { supabase: mockSupabase };
});

import { supabase } from "./supabase";
import {
  saveProjectToCloud,
  overwriteProjectInCloud,
  fetchProjects,
  loadProjectFromCloud,
  deleteProjectFromCloud,
  findProjectByName,
} from "./projectApi";

describe("projectApi", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  });

  describe("saveProjectToCloud", () => {
    it("uploads file and inserts metadata", async () => {
      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      supabase.storage.from.mockReturnValue({ upload: uploadMock });
      supabase.from.mockReturnValue({ insert: insertMock });

      const projectData = { daw: { transport: { bpm: 140 } } };
      const id = await saveProjectToCloud("My Project", projectData);

      expect(id).toBeDefined();
      expect(uploadMock).toHaveBeenCalledOnce();
      expect(insertMock).toHaveBeenCalledOnce();
      const inserted = insertMock.mock.calls[0][0];
      expect(inserted.name).toBe("My Project");
      expect(inserted.bpm).toBe(140);
      expect(inserted.user_id).toBe(userId);
    });

    it("throws when not authenticated", async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(saveProjectToCloud("Test", {})).rejects.toThrow("signed in");
    });

    it("throws on upload error", async () => {
      supabase.storage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: { message: "Upload failed" } }),
      });
      await expect(saveProjectToCloud("Test", {})).rejects.toThrow("Upload failed");
    });
  });

  describe("fetchProjects", () => {
    it("returns ordered project list", async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: [{ id: "1", name: "A" }], error: null });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await fetchProjects();
      expect(result).toEqual([{ id: "1", name: "A" }]);
      expect(selectMock).toHaveBeenCalledWith("id, name, bpm, updated_at");
    });

    it("throws on database error", async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
      });
      await expect(fetchProjects()).rejects.toThrow("DB error");
    });
  });

  describe("loadProjectFromCloud", () => {
    it("downloads and parses project file", async () => {
      const metaSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { storage_path: "path" }, error: null }),
        }),
      });
      supabase.from.mockReturnValue({ select: metaSelect });
      supabase.storage.from.mockReturnValue({
        download: vi.fn().mockResolvedValue({
          data: { text: vi.fn().mockResolvedValue('{"project":{}}') },
          error: null,
        }),
      });

      const result = await loadProjectFromCloud("id-1");
      expect(result).toEqual({ project: {} });
    });

    it("throws when project not found", async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });
      await expect(loadProjectFromCloud("missing")).rejects.toThrow("Project not found");
    });
  });

  describe("deleteProjectFromCloud", () => {
    it("removes file and db record", async () => {
      const removeMock = vi.fn().mockResolvedValue({ error: null });
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { storage_path: "path" }, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: deleteEqMock }),
      });
      supabase.storage.from.mockReturnValue({ remove: removeMock });

      await deleteProjectFromCloud("id-1");
      expect(removeMock).toHaveBeenCalledWith(["path"]);
      expect(deleteEqMock).toHaveBeenCalledWith("id", "id-1");
    });
  });

  describe("findProjectByName", () => {
    it("returns project when found", async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: { id: "1", name: "Test" }, error: null });
      const secondEqMock = vi.fn().mockReturnValue({ single: singleMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: firstEqMock }),
      });

      const result = await findProjectByName("Test");
      expect(result).toEqual({ id: "1", name: "Test" });
    });

    it("returns null when not found (PGRST116)", async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } });
      const secondEqMock = vi.fn().mockReturnValue({ single: singleMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: firstEqMock }),
      });

      const result = await findProjectByName("Missing");
      expect(result).toBeNull();
    });
  });

  describe("overwriteProjectInCloud", () => {
    it("uploads and updates existing project", async () => {
      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      supabase.storage.from.mockReturnValue({ upload: uploadMock });
      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: updateEqMock }),
      });

      await overwriteProjectInCloud("id-1", "Updated", { daw: { transport: { bpm: 128 } } });
      expect(uploadMock).toHaveBeenCalledOnce();
      expect(updateEqMock).toHaveBeenCalledWith("id", "id-1");
    });
  });
});
