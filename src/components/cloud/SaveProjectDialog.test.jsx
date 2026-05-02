import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { SaveProjectDialog } from "./SaveProjectDialog";

const mockSaveProjectToCloud = vi.fn();
const mockFindProjectByName = vi.fn();
const mockDownloadProjectFile = vi.fn();
const mockSerializeProject = vi.fn(() => ({ format: "test" }));

vi.mock("../../lib/projectApi", () => ({
  saveProjectToCloud: (...args) => mockSaveProjectToCloud(...args),
  overwriteProjectInCloud: vi.fn(),
  findProjectByName: (...args) => mockFindProjectByName(...args),
}));

vi.mock("../../lib/projectSerializer", () => ({
  serializeProject: (...args) => mockSerializeProject(...args),
  downloadProjectFile: (...args) => mockDownloadProjectFile(...args),
}));

function renderWithStore(ui, { preloadedState } = {}) {
  const store = configureStore({
    reducer: {
      user: (state = { currentUser: null }, action) => state,
      daw: (state = {}, action) => state,
    },
    preloadedState: preloadedState || { user: { currentUser: null }, daw: {} },
  });
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

describe("SaveProjectDialog", () => {
  it("renders save form with default name", () => {
    renderWithStore(<SaveProjectDialog onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Save Project/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Untitled Project")).toBeInTheDocument();
  });

  it("shows error when project name is empty", async () => {
    renderWithStore(<SaveProjectDialog onClose={vi.fn()} />);
    const input = screen.getByDisplayValue("Untitled Project");
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(screen.getByText(/Project name is required/i)).toBeInTheDocument();
  });

  it("shows error when no save location is selected", async () => {
    renderWithStore(<SaveProjectDialog onClose={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) {
      if (cb.checked) await userEvent.click(cb);
    }
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(screen.getByText(/Select at least one save location/i)).toBeInTheDocument();
  });

  it("disables cloud checkbox when user is not logged in", () => {
    renderWithStore(<SaveProjectDialog onClose={vi.fn()} />);
    const cloudCheckbox = screen.getByLabelText(/Cloud/i);
    expect(cloudCheckbox).toBeDisabled();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    renderWithStore(<SaveProjectDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
