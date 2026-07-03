import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import {
  applyAiOperations,
  prepareAiOperations,
  validatePreparedAiOperations,
} from "../../ai/aiAgentOperations";
import { AI_AGENT_DEFAULT_MODEL } from "../../ai/aiAgentPrompt";
import { buildAiProjectSummary } from "../../ai/aiProjectSummary";
import { loadAiSampleIndex, searchAiSamples } from "../../ai/aiSampleIndex";
import { requestAiAgentPlan, testOpenAiConnection } from "../../ai/openAiClient";
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchConversations,
  loadConversation,
  updateConversation,
} from "../../lib/aiConversationsApi";

const AI_AGENT_KEY_STORAGE = "openstudio.ai.openaiKey";
const AI_AGENT_MODEL_STORAGE = "openstudio.ai.model";

// Max characters for the auto-generated conversation title.
const TITLE_MAX_LENGTH = 50;

function readStoredValue(key, fallback = "") {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked in privacy modes; the in-memory key still works.
  }
}

/**
 * Derives a short title from the first user message, truncated on a word
 * boundary so the title does not cut mid-word.
 */
function deriveTitle(firstMessage) {
  const raw = String(firstMessage || "").trim();
  if (!raw) {
    return "New chat";
  }
  if (raw.length <= TITLE_MAX_LENGTH) {
    return raw;
  }
  const slice = raw.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 20 ? slice.slice(0, lastSpace) : slice) + "...";
}

export function useAiAgentController() {
  const dispatch = useDispatch();
  const store = useStore();
  const currentUser = useSelector(function (state) {
    return state.user.currentUser;
  });
  const isAuthenticated = Boolean(currentUser);

  const [apiKey, setApiKey] = useState(function () {
    return readStoredValue(AI_AGENT_KEY_STORAGE);
  });
  const [rememberKey, setRememberKey] = useState(function () {
    return Boolean(readStoredValue(AI_AGENT_KEY_STORAGE));
  });
  const [model, setModel] = useState(function () {
    return readStoredValue(AI_AGENT_MODEL_STORAGE, AI_AGENT_DEFAULT_MODEL);
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [pendingOperations, setPendingOperations] = useState([]);
  const [operationResults, setOperationResults] = useState([]);
  const [rejectedOperations, setRejectedOperations] = useState([]);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Conversation history (Supabase-backed, authenticated users only)
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  useEffect(
    function () {
      writeStoredValue(AI_AGENT_MODEL_STORAGE, model || AI_AGENT_DEFAULT_MODEL);
    },
    [model],
  );

  useEffect(
    function () {
      writeStoredValue(AI_AGENT_KEY_STORAGE, rememberKey ? apiKey : "");
    },
    [apiKey, rememberKey],
  );

  // Load conversation list when the user signs in; clear when signed out.
  const refreshConversations = useCallback(
    async function () {
      if (!isAuthenticated) {
        setConversations([]);
        setActiveConversationId(null);
        return;
      }

      setIsLoadingConversations(true);
      try {
        const list = await fetchConversations();
        setConversations(list);
      } catch {
        // Non-fatal: the chat still works without persisted history.
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(
    function () {
      refreshConversations();
    },
    [refreshConversations],
  );

  const startNewConversation = useCallback(function () {
    setActiveConversationId(null);
    setMessages([]);
    setPendingOperations([]);
    setOperationResults([]);
    setRejectedOperations([]);
    setError("");
  }, []);

  const selectConversation = useCallback(
    async function (conversationId) {
      if (!conversationId) {
        return;
      }

      setIsLoadingConversations(true);
      try {
        const convo = await loadConversation(conversationId);
        if (!convo) {
          return;
        }

        setActiveConversationId(conversationId);
        setMessages(Array.isArray(convo.messages) ? convo.messages : []);
        setPendingOperations(
          Array.isArray(convo.pending_operations)
            ? convo.pending_operations
            : [],
        );
        setOperationResults(
          Array.isArray(convo.operation_results)
            ? convo.operation_results
            : [],
        );
        setRejectedOperations(
          Array.isArray(convo.rejected_operations)
            ? convo.rejected_operations
            : [],
        );
        setError("");
      } catch {
        // If load fails, stay on the current conversation.
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [],
  );

  const deleteConversation = useCallback(
    async function (conversationId) {
      if (!conversationId) {
        return;
      }

      try {
        await deleteConversationApi(conversationId);
        setConversations(function (current) {
          return current.filter(function (item) {
            return item.id !== conversationId;
          });
        });
        if (conversationId === activeConversationId) {
          startNewConversation();
        }
      } catch {
        // Non-fatal: keep the conversation in the list if delete fails.
      }
    },
    [activeConversationId, startNewConversation],
  );

  const sendMessage = async function (event) {
    event?.preventDefault();

    const userMessage = String(input || "").trim();
    if (!userMessage || isSending) {
      return;
    }

    setError("");
    setInput("");
    setIsSending(true);
    setPendingOperations([]);
    setOperationResults([]);
    setRejectedOperations([]);

    // Snapshot the conversation history before adding the new user message,
    // so the API receives prior turns as context (works for loaded chats too).
    const conversationHistory = messages.slice();

    setMessages(function (current) {
      return current.concat({ role: "user", content: userMessage });
    });

    try {
      const allSamples = await loadAiSampleIndex(800);
      // Always send a broad sample catalog so the agent knows what's
      // available without the user having to mention specific names.
      const searched = searchAiSamples(allSamples, userMessage, 120);
      const availableSamples = searched.length >= 20
        ? searched
        : allSamples.slice(0, 200);
      const currentDawState = store.getState().daw;
      const projectSummary = buildAiProjectSummary(
        currentDawState,
        availableSamples,
      );
      const response = await requestAiAgentPlan({
        apiKey,
        model,
        userMessage,
        projectSummary,
        conversationHistory,
      });
      const prepared = prepareAiOperations(response.operations);
      const validatedOperations = validatePreparedAiOperations(
        prepared.operations,
        {
          dawState: currentDawState,
          availableSamples,
        },
      );

      setPendingOperations(validatedOperations);
      setRejectedOperations(prepared.rejected);

      const assistantMessage = { role: "assistant", content: response.message };
      const updatedMessages = messages.concat(
        { role: "user", content: userMessage },
        assistantMessage,
      );
      setMessages(updatedMessages);

      // Persist to Supabase if the user is authenticated.
      if (isAuthenticated) {
        if (!activeConversationId) {
          const created = await createConversation({
            title: deriveTitle(userMessage),
            messages: updatedMessages,
            pendingOperations: validatedOperations,
            operationResults: [],
            rejectedOperations: prepared.rejected,
          });
          setActiveConversationId(created.id);
          setConversations(function (current) {
            return [
              {
                id: created.id,
                title: created.title,
                created_at: created.created_at,
                updated_at: created.updated_at,
              },
            ].concat(current);
          });
        } else {
          await updateConversation(activeConversationId, {
            messages: updatedMessages,
            pendingOperations: validatedOperations,
            operationResults: [],
            rejectedOperations: prepared.rejected,
          });
          setConversations(function (current) {
            return current.map(function (item) {
              if (item.id !== activeConversationId) {
                return item;
              }
              return Object.assign({}, item, {
                updated_at: new Date().toISOString(),
              });
            });
          });
        }
      }
    } catch (sendError) {
      const message = String(sendError?.message || sendError);
      setError(message);
      setMessages(function (current) {
        return current.concat({
          role: "assistant",
          content: "I could not prepare a plan: " + message,
        });
      });
    } finally {
      setIsSending(false);
    }
  };

  const applyPendingOperations = function () {
    if (pendingOperations.length === 0 || isApplying) {
      return;
    }

    setIsApplying(true);
    const result = applyAiOperations(pendingOperations, {
      dispatch,
      getState: store.getState,
    });
    setOperationResults(result.results);
    setPendingOperations([]);
    setRejectedOperations([]);

    const systemMessage = {
      role: "system",
      content:
        "Applied " +
        result.applied.length +
        " operation" +
        (result.applied.length === 1 ? "" : "s") +
        (result.skipped.length > 0
          ? ". Skipped " + result.skipped.length + "."
          : "."),
    };
    const updatedMessages = messages.concat(systemMessage);
    setMessages(updatedMessages);

    // Persist the applied state to Supabase.
    if (isAuthenticated && activeConversationId) {
      updateConversation(activeConversationId, {
        messages: updatedMessages,
        pendingOperations: [],
        operationResults: result.results,
        rejectedOperations: [],
      })
        .then(function (updated) {
          setConversations(function (current) {
            return current.map(function (item) {
              if (item.id !== activeConversationId) {
                return item;
              }
              return Object.assign({}, item, {
                updated_at: updated.updated_at,
              });
            });
          });
        })
        .catch(function () {
          // Non-fatal: the operations are already applied in Redux.
        });
    }

    setIsApplying(false);
  };

  const testConnection = async function () {
    if (isTestingConnection) {
      return;
    }

    setError("");
    setConnectionStatus("");
    setIsTestingConnection(true);

    try {
      const result = await testOpenAiConnection({ apiKey, model });
      setConnectionStatus("Connected to " + result.model + ".");
    } catch (testError) {
      const message = String(testError?.message || testError);
      setError(message);
      setConnectionStatus("");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const forgetKey = function () {
    setApiKey("");
    setRememberKey(false);
    setConnectionStatus("");
    writeStoredValue(AI_AGENT_KEY_STORAGE, "");
  };

  return {
    apiKey,
    setApiKey,
    rememberKey,
    setRememberKey,
    model,
    setModel,
    input,
    setInput,
    messages,
    pendingOperations,
    operationResults,
    rejectedOperations,
    error,
    connectionStatus,
    isSending,
    isApplying,
    isTestingConnection,
    sendMessage,
    applyPendingOperations,
    testConnection,
    forgetKey,
    isAuthenticated,
    conversations,
    activeConversationId,
    isLoadingConversations,
    selectConversation,
    startNewConversation,
    deleteConversation,
  };
}
