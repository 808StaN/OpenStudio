import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { ThemeDialog } from "./ThemeDialog";

const testDawSlice = createSlice({
  name: "daw",
  initialState: { ui: { theme: "default" } },
  reducers: {
    setTheme(state, action) {
      state.ui.theme = action.payload;
    },
  },
});

function renderWithStore(ui, { preloadedState } = {}) {
  const store = configureStore({
    reducer: { daw: testDawSlice.reducer },
    preloadedState: preloadedState || { daw: { ui: { theme: "default" } } },
  });
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

describe("ThemeDialog", () => {
  it("renders all theme options", () => {
    renderWithStore(<ThemeDialog onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Default/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Teal Slate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Studio 95/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aero/i })).toBeInTheDocument();
  });

  it("marks the active theme", () => {
    renderWithStore(<ThemeDialog onClose={vi.fn()} />, {
      preloadedState: { daw: { ui: { theme: "studio95" } } },
    });
    const active = screen.getByRole("button", { name: /Studio 95/i });
    expect(active).toHaveAttribute("aria-pressed", "true");
  });

  it("dispatches setTheme and calls onClose when a theme is selected", async () => {
    const onClose = vi.fn();
    const { store } = renderWithStore(<ThemeDialog onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /Aero/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(store.getState().daw.ui.theme).toBe("aero");
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    renderWithStore(<ThemeDialog onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /Close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
