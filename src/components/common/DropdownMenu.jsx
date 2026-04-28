// Shared dropdown menu with radio options.
export function DropdownMenu(props) {
  const {
    menuRef,
    triggerClassName = "snap-trigger",
    triggerLabel,
    isOpen,
    setIsOpen,
    options,
    activeKey,
    onSelect,
    radioName,
    onTriggerClick,
  } = props;

  return (
    <div className="snap-menu" ref={menuRef}>
      <button
        type="button"
        className={triggerClassName}
        onClick={function () {
          if (onTriggerClick) {
            onTriggerClick();
          } else {
            setIsOpen(function (value) {
              return !value;
            });
          }
        }}
      >
        {triggerLabel}
      </button>
      {isOpen ? (
        <div className="snap-dropdown">
          {options.map(function (option) {
            return (
              <label key={option.key} className="snap-option">
                <input
                  type="radio"
                  name={radioName}
                  checked={activeKey === option.key}
                  onChange={function () {
                    onSelect(option.key);
                    setIsOpen(false);
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
