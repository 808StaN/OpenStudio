import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ErrorBoundary } from "./ErrorBoundary"

function BrokenComponent() {
  throw new Error("Broken component")
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy
  let reloadSpy

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(function () {})
    reloadSpy = vi.fn()
    Object.defineProperty(window, "location", {
      value: { reload: reloadSpy },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>DAW workspace</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText("DAW workspace")).toBeInTheDocument()
  })

  it("shows fallback UI when a child component crashes", async () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /show details/i }))
    expect(screen.getByText(/broken component/i)).toBeInTheDocument()
  })

  it("offers a reload action", async () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )

    await userEvent.click(screen.getByRole("button", { name: /reload app/i }))
    expect(reloadSpy).toHaveBeenCalledOnce()
  })
})
