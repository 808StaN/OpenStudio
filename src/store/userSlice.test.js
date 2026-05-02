import { describe, it, expect } from "vitest";
import { userReducer, setUser, clearUser, setAuthLoading, setAuthError } from "./userSlice";

describe("userReducer", () => {
  const initialState = {
    currentUser: null,
    isLoading: false,
    error: null,
  };

  it("returns the initial state", () => {
    expect(userReducer(undefined, { type: "@@INIT" })).toEqual(initialState);
  });

  it("sets user and clears error on setUser", () => {
    const user = { id: "1", username: "test", nickname: "Test", email: "test@example.com" };
    const state = userReducer({ ...initialState, error: "previous" }, setUser(user));
    expect(state.currentUser).toEqual(user);
    expect(state.error).toBeNull();
  });

  it("clears user and error on clearUser", () => {
    const prev = { currentUser: { id: "1" }, isLoading: false, error: "err" };
    const state = userReducer(prev, clearUser());
    expect(state.currentUser).toBeNull();
    expect(state.error).toBeNull();
  });

  it("sets loading state on setAuthLoading", () => {
    const state = userReducer(initialState, setAuthLoading(true));
    expect(state.isLoading).toBe(true);
  });

  it("sets error and resets loading on setAuthError", () => {
    const prev = { ...initialState, isLoading: true };
    const state = userReducer(prev, setAuthError("Login failed"));
    expect(state.error).toBe("Login failed");
    expect(state.isLoading).toBe(false);
  });
});
