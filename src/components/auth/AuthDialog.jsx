import { useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setUser, setAuthLoading, setAuthError } from "../../store/userSlice";

export function AuthDialog({ onClose }) {
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector(function (state) {
    return state.user;
  });
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState(null);

  const resetForm = useCallback(function () {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setValidationError(null);
    dispatch(setAuthError(null));
  }, [dispatch]);

  const toggleMode = useCallback(function () {
    setMode(function (prev) {
      return prev === "login" ? "register" : "login";
    });
    resetForm();
  }, [resetForm]);

  const validate = useCallback(function () {
    if (!email.trim() || !password.trim()) {
      return "Email and password are required.";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }
    if (mode === "register" && password !== confirmPassword) {
      return "Passwords do not match.";
    }
    return null;
  }, [email, password, confirmPassword, mode]);

  const handleSubmit = useCallback(
    function (event) {
      event.preventDefault();
      const validation = validate();
      if (validation) {
        setValidationError(validation);
        return;
      }
      setValidationError(null);
      dispatch(setAuthLoading(true));

      // Mock auth — no backend yet. Simulate network delay.
      window.setTimeout(function () {
        dispatch(
          setUser({
            id: "mock-user-" + Date.now(),
            email: email.trim(),
          }),
        );
        dispatch(setAuthLoading(false));
        onClose();
      }, 800);
    },
    [dispatch, email, password, validate, onClose],
  );

  const displayError = validationError || error;

  return (
    <div className="auth-dialog-overlay" onClick={onClose}>
      <div
        className="auth-dialog"
        onClick={function (event) {
          event.stopPropagation();
        }}
      >
        <header className="auth-dialog-header">
          <h3>{mode === "login" ? "Sign In" : "Create Account"}</h3>
          <button
            type="button"
            className="auth-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form className="auth-dialog-form" onSubmit={handleSubmit}>
          {displayError ? (
            <div className="auth-dialog-error">{displayError}</div>
          ) : null}

          <label className="auth-dialog-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={function (event) {
                setEmail(event.target.value);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-dialog-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={function (event) {
                setPassword(event.target.value);
              }}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>

          {mode === "register" ? (
            <label className="auth-dialog-field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={function (event) {
                  setConfirmPassword(event.target.value);
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}

          <button
            type="submit"
            className="auth-dialog-submit"
            disabled={isLoading}
          >
            {isLoading
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <footer className="auth-dialog-footer">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button type="button" className="auth-dialog-link" onClick={toggleMode}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="auth-dialog-link" onClick={toggleMode}>
                Sign in
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
