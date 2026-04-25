import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearUser } from "../../store/userSlice";

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

      window.addEventListener("mousedown", onPointerDown);
      return function () {
        window.removeEventListener("mousedown", onPointerDown);
      };
    },
    [menuOpen],
  );

  if (!currentUser) {
    return (
      <button className="transport-btn small" onClick={onOpenAuth}>
        Sign In
      </button>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="transport-btn small"
        onClick={function () {
          setMenuOpen(function (prev) {
            return !prev;
          });
        }}
      >
        {currentUser.nickname || currentUser.username || currentUser.email}
      </button>

      {menuOpen ? (
        <div className="user-menu-dropdown">
          <button
            type="button"
            onClick={function () {
              dispatch(clearUser());
              setMenuOpen(false);
            }}
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
