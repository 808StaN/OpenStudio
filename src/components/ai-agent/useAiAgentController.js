import { useEffect, useState } from "react";
import { useDispatch, useStore } from "react-redux";
import {
  applyAiOperations,
  prepareAiOperations,
  validatePreparedAiOperations,
} from "../../ai/aiAgentOperations";
import { AI_AGENT_DEFAULT_MODEL } from "../../ai/aiAgentPrompt";
import { buildAiProjectSummary } from "../../ai/aiProjectSummary";
import { loadAiSampleIndex, searchAiSamples } from "../../ai/aiSampleIndex";
import { requestAiAgentPlan, testOpenAiConnection } from "../../ai/openAiClient";

const AI_AGENT_KEY_STORAGE = "openstudio.ai.openaiKey";
const AI_AGENT_MODEL_STORAGE = "openstudio.ai.model";

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

export function useAiAgentController() {
  const dispatch = useDispatch();
  const store = useStore();
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
    setMessages(function (current) {
      return current.concat({ role: "user", content: userMessage });
    });

    try {
      const allSamples = await loadAiSampleIndex(800);
      const availableSamples = searchAiSamples(allSamples, userMessage, 120);
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
      setMessages(function (current) {
        return current.concat({
          role: "assistant",
          content: response.message,
        });
      });
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
    setMessages(function (current) {
      return current.concat({
        role: "system",
        content:
          "Applied " +
          result.applied.length +
          " operation" +
          (result.applied.length === 1 ? "" : "s") +
          (result.skipped.length > 0
            ? ". Skipped " + result.skipped.length + "."
            : "."),
      });
    });
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
  };
}
