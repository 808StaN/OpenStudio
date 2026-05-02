import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { AuthDialog } from "./AuthDialog";
import { userReducer } from "../../store/userSlice";

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn(), signUp: vi.fn() },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

function renderWithStore(ui, { preloadedState } = {}) {
  const store = configureStore({
    reducer: { user: userReducer },
    preloadedState: preloadedState || { user: { currentUser: null, isLoading: false, error: null } },
  });
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

describe("AuthDialog", () => {
  it("renders login form by default", () => {
    renderWithStore(<AuthDialog onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Sign In/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("your_username")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign In/i })).toBeInTheDocument();
  });

  it("switches to register mode", async () => {
    renderWithStore(<AuthDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Create one/i }));

    expect(screen.getByRole("heading", { name: /Create Account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your display name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Account/i })).toBeInTheDocument();
  });

  it("shows validation error for empty username", async () => {
    renderWithStore(<AuthDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Sign In/i }));
    expect(screen.getByText(/Username and password are required/i)).toBeInTheDocument();
  });

  it("shows validation error for short password", async () => {
    renderWithStore(<AuthDialog onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("your_username"), "testuser");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "123");
    await userEvent.click(screen.getByRole("button", { name: /Sign In/i }));
    expect(screen.getByText(/Password must be at least 6 characters/i)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    renderWithStore(<AuthDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
