import { Component } from "react"

function getErrorMessage(error) {
  return String(error?.message || error || "Unknown application error")
}

/**
 * Last-resort UI protection for unexpected React and browser-level failures.
 * It prevents a blank screen and gives the user a safe reload path.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidMount() {
    window.addEventListener("error", this.handleWindowError)
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection)
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error("OpenStudio recovered from a React error", error, errorInfo)
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleWindowError)
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection)
  }

  handleWindowError = (event) => {
    this.setState({
      hasError: true,
      error: event.error || event.message || "Unexpected browser error",
      errorInfo: null,
    })
  }

  handleUnhandledRejection = (event) => {
    this.setState({
      hasError: true,
      error: event.reason || "Unhandled promise rejection",
      errorInfo: null,
    })
  }

  handleReloadClick = () => {
    window.location.reload()
  }

  handleToggleDetails = () => {
    this.setState(function (state) {
      return { showDetails: !state.showDetails }
    })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const message = getErrorMessage(this.state.error)
    const componentStack = String(this.state.errorInfo?.componentStack || "").trim()

    return (
      <main className="app-error-boundary" role="alert">
        <section className="app-error-boundary-card">
          <p className="app-error-boundary-kicker">OpenStudio</p>
          <h1>Something went wrong</h1>
          <p className="app-error-boundary-message">
            The app caught an unexpected error and stopped the broken UI before it could crash the whole workspace.
          </p>

          <div className="app-error-boundary-actions">
            <button type="button" onClick={this.handleReloadClick}>
              Reload app
            </button>
            <button type="button" onClick={this.handleToggleDetails}>
              {this.state.showDetails ? "Hide details" : "Show details"}
            </button>
          </div>

          {this.state.showDetails ? (
            <pre className="app-error-boundary-details">
              {message}
              {componentStack ? "\n" + componentStack : ""}
            </pre>
          ) : null}
        </section>
      </main>
    )
  }
}
