import { createSlice } from "@reduxjs/toolkit";

const userSlice = createSlice({
  name: "user",
  initialState: {
    currentUser: null,
    isLoading: false,
    error: null,
  },
  reducers: {
    setUser(state, action) {
      state.currentUser = action.payload;
      state.error = null;
    },
    clearUser(state) {
      state.currentUser = null;
      state.error = null;
    },
    setAuthLoading(state, action) {
      state.isLoading = action.payload;
    },
    setAuthError(state, action) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const { setUser, clearUser, setAuthLoading, setAuthError } =
  userSlice.actions;
export const userReducer = userSlice.reducer;
