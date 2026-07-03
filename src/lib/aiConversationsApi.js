/**
 * @fileoverview aiConversationsApi — Supabase CRUD for AI Agent chat history.
 * Mirrors the projectApi.js pattern: all reads/writes are scoped to the
 * authenticated user via RLS policies on the ai_conversations table.
 */

import { assertSupabaseConfigured, supabase } from "./supabase";

async function getAuthenticatedUserId() {
  assertSupabaseConfigured();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error("You must be signed in to use AI chat history.");
  }

  return user.id;
}

/**
 * Fetch the conversation list (headers only — no messages payload) for the
 * authenticated user, ordered by most-recently-updated first.
 *
 * @returns {Promise<Array<{id: string, title: string, created_at: string, updated_at: string}>>}
 */
export async function fetchConversations() {
  const userId = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Load a single conversation with full message + operation payloads.
 *
 * @param {string} conversationId
 * @returns {Promise<object|null>}
 */
export async function loadConversation(conversationId) {
  const userId = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

/**
 * Insert a new conversation row for the authenticated user.
 *
 * @param {object} params
 * @param {string} params.title
 * @param {Array} params.messages
 * @param {Array} [params.pendingOperations]
 * @param {Array} [params.operationResults]
 * @param {Array} [params.rejectedOperations]
 * @returns {Promise<object>} The created row (including generated id).
 */
export async function createConversation({
  title,
  messages,
  pendingOperations = [],
  operationResults = [],
  rejectedOperations = [],
}) {
  const userId = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      user_id: userId,
      title: String(title || "New chat").slice(0, 200),
      messages,
      pending_operations: pendingOperations,
      operation_results: operationResults,
      rejected_operations: rejectedOperations,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Patch an existing conversation. Only the provided fields are updated;
 * updated_at is bumped automatically by the database trigger or here.
 *
 * @param {string} conversationId
 * @param {object} patch — any of: title, messages, pendingOperations,
 *   operationResults, rejectedOperations
 * @returns {Promise<object>} The updated row.
 */
export async function updateConversation(conversationId, patch) {
  const userId = await getAuthenticatedUserId();

  const dbPatch = {};
  if (patch.title !== undefined) {
    dbPatch.title = String(patch.title).slice(0, 200);
  }
  if (patch.messages !== undefined) {
    dbPatch.messages = patch.messages;
  }
  if (patch.pendingOperations !== undefined) {
    dbPatch.pending_operations = patch.pendingOperations;
  }
  if (patch.operationResults !== undefined) {
    dbPatch.operation_results = patch.operationResults;
  }
  if (patch.rejectedOperations !== undefined) {
    dbPatch.rejected_operations = patch.rejectedOperations;
  }
  dbPatch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("ai_conversations")
    .update(dbPatch)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Delete a conversation owned by the authenticated user.
 *
 * @param {string} conversationId
 */
export async function deleteConversation(conversationId) {
  const userId = await getAuthenticatedUserId();

  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
