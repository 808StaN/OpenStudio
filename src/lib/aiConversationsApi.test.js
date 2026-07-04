import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  };
  return {
    SUPABASE_UNCONFIGURED_MESSAGE:
      "Cloud login is unavailable because Supabase is not configured.",
    assertSupabaseConfigured: vi.fn(),
    isSupabaseConfigured: true,
    supabase: mockSupabase,
  };
});

import { assertSupabaseConfigured, supabase } from "./supabase";
import {
  fetchConversations,
  loadConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "./aiConversationsApi";

describe("aiConversationsApi", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    assertSupabaseConfigured.mockImplementation(function () {});
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  });

  it("throws when not authenticated", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    await expect(fetchConversations()).rejects.toThrow("signed in");
  });

  describe("fetchConversations", () => {
    it("returns conversation headers ordered by updated_at desc", async () => {
      const orderMock = vi.fn().mockResolvedValue({
        data: [
          { id: "c1", title: "Chat 1", updated_at: "2025-01-02" },
          { id: "c2", title: "Chat 2", updated_at: "2025-01-01" },
        ],
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await fetchConversations();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("c1");
      expect(selectMock).toHaveBeenCalledWith(
        "id, title, created_at, updated_at",
      );
      expect(eqMock).toHaveBeenCalledWith("user_id", userId);
      expect(orderMock).toHaveBeenCalledWith("updated_at", {
        ascending: false,
      });
    });

    it("returns empty array when no conversations", async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await fetchConversations();
      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      const orderMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      await expect(fetchConversations()).rejects.toThrow("DB error");
    });
  });

  describe("loadConversation", () => {
    it("returns full conversation with messages", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: "c1",
          title: "Chat 1",
          messages: [{ role: "user", content: "hi" }],
          pending_operations: [],
          operation_results: [],
          rejected_operations: [],
        },
        error: null,
      });
      const secondEqMock = vi.fn().mockReturnValue({ single: singleMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const selectMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await loadConversation("c1");

      expect(result.id).toBe("c1");
      expect(result.messages).toHaveLength(1);
      expect(firstEqMock).toHaveBeenCalledWith("id", "c1");
      expect(secondEqMock).toHaveBeenCalledWith("user_id", userId);
    });

    it("returns null when not found", async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const secondEqMock = vi.fn().mockReturnValue({ single: singleMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const selectMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await loadConversation("missing");
      expect(result).toBeNull();
    });
  });

  describe("createConversation", () => {
    it("inserts a new conversation and returns the row", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: "new-id", title: "New chat", messages: [] },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ insert: insertMock });

      const result = await createConversation({
        title: "My chat",
        messages: [{ role: "user", content: "hello" }],
        pendingOperations: [{ type: "set_bpm", payload: { bpm: 120 } }],
      });

      expect(result.id).toBe("new-id");
      expect(insertMock).toHaveBeenCalledOnce();
      const inserted = insertMock.mock.calls[0][0];
      expect(inserted.user_id).toBe(userId);
      expect(inserted.title).toBe("My chat");
      expect(inserted.messages).toEqual([
        { role: "user", content: "hello" },
      ]);
      expect(inserted.pending_operations).toEqual([
        { type: "set_bpm", payload: { bpm: 120 } },
      ]);
    });

    it("truncates very long titles", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: "new-id" },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ insert: insertMock });

      const longTitle = "A".repeat(300);
      await createConversation({ title: longTitle, messages: [] });

      expect(insertMock.mock.calls[0][0].title.length).toBe(200);
    });

    it("throws on insert error", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Insert failed" },
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ insert: insertMock });

      await expect(
        createConversation({ title: "Test", messages: [] }),
      ).rejects.toThrow("Insert failed");
    });
  });

  describe("updateConversation", () => {
    it("updates only provided fields and returns the row", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: "c1", title: "Updated" },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const secondEqMock = vi.fn().mockReturnValue({ select: selectMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ update: updateMock });

      const result = await updateConversation("c1", {
        title: "Updated",
        messages: [{ role: "user", content: "test" }],
      });

      expect(result.id).toBe("c1");
      const patch = updateMock.mock.calls[0][0];
      expect(patch.title).toBe("Updated");
      expect(patch.messages).toEqual([
        { role: "user", content: "test" },
      ]);
      expect(patch).not.toHaveProperty("pending_operations");
      expect(patch.updated_at).toBeDefined();
    });

    it("converts camelCase operation fields to snake_case", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: "c1" },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const secondEqMock = vi.fn().mockReturnValue({ select: selectMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ update: updateMock });

      await updateConversation("c1", {
        pendingOperations: [{ type: "set_bpm" }],
        operationResults: [],
        rejectedOperations: [],
      });

      const patch = updateMock.mock.calls[0][0];
      expect(patch.pending_operations).toEqual([{ type: "set_bpm" }]);
      expect(patch.operation_results).toEqual([]);
      expect(patch.rejected_operations).toEqual([]);
    });

    it("throws on update error", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Update failed" },
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const secondEqMock = vi.fn().mockReturnValue({ select: selectMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ update: updateMock });

      await expect(
        updateConversation("c1", { title: "x" }),
      ).rejects.toThrow("Update failed");
    });
  });

  describe("deleteConversation", () => {
    it("deletes the conversation scoped to the user", async () => {
      const secondEqMock = vi.fn().mockResolvedValue({ error: null });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ delete: deleteMock });

      await deleteConversation("c1");

      expect(deleteMock).toHaveBeenCalledOnce();
      expect(firstEqMock).toHaveBeenCalledWith("id", "c1");
      expect(secondEqMock).toHaveBeenCalledWith("user_id", userId);
    });

    it("throws on delete error", async () => {
      const secondEqMock = vi.fn().mockResolvedValue({
        error: { message: "Delete failed" },
      });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      supabase.from.mockReturnValue({ delete: deleteMock });

      await expect(deleteConversation("c1")).rejects.toThrow("Delete failed");
    });
  });
});
