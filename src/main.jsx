import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import App from "./App.jsx"
import { ErrorBoundary } from "./components/ErrorBoundary.jsx"
import "./index.css"
import { store } from "./store"

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <Provider store={store}>
      <App />
    </Provider>
  </ErrorBoundary>,
)
