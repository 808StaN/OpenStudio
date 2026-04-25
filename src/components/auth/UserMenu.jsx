import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { User } from "lucide-react";
import { clearUser } from "../../store/userSlice";
import { supabase } from "../../lib/supabase";

/**
 * UserMenu shows either a "Sign In" trigger (when logged out) or the
 * current user's nickname (when logged in). The logged-in dropdown uses
 * the same visual style as the Project menu so the toolbar stays consistent.
 */
export function UserMenu({ onOpenAuth }) {
  const dispatch = useDispatch();
  const currentUser = useSelector(function (state) {
    return state.user.currentUser;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(
    function () {
      if (!menuOpen) {
        return;
      }

      const onPointerDown = function (event) {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setMenuOpen(false);
        }
      };

      const onKeyDown = function (event) {
        if (event.key === "Escape") {
          setMenuOpen(false);
        }
      };

      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [menuOpen],
  );

  if (!currentUser) {
    return (
      <button className="transport-btn small" onClick={onOpenAuth}>
        <User size={14} />
        Sign In
      </button>
    );
  }

  return (
    <div className="user-menu project-menu" ref={menuRef}>
      <button
        className="transport-btn small project-menu-trigger"
        onClick={function () {
          setMenuOpen(function (prev) {
            return !prev;
          });
        }}
        aria-haspopup="true"
        aria-expanded={menuOpen}
      >
        <User size={14} />
        {currentUser.nickname}
      </button>

      {menuOpen ? (
        <div className="project-dropdown" role="menu">
          <button
            type="button"
            className="project-dropdown-item"
            onClick={async function () {
              await supabase.auth.signOut();
              dispatch(clearUser());
              setMenuOpen(false);
            }}
            role="menuitem"
          >
            <span>Sign Out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
