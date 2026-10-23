"use client";
import { useMemo, useState } from "react";
type Item = { code: string; name: string };
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export default function VehicleCombobox({
  label,
  items,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
    const filtered = items
      .filter((item) => normalize(item.name).includes(normalize(query)))
      .sort((a, b) => collator.compare(a.name, b.name));
    return Object.entries(
      Object.groupBy(
        filtered,
        (item) =>
          normalize(item.name).charAt(0).toLocaleUpperCase("pt-BR") || "#",
      ),
    );
  }, [items, query]);
  return (
    <div className="vehicle-combobox">
      <span>{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {value || placeholder}
        <i>⌄</i>
      </button>
      {open && !disabled ? (
        <div className="vehicle-combobox-popover">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Pesquisar ${label.toLocaleLowerCase("pt-BR")}...`}
            aria-label={`Pesquisar ${label.toLocaleLowerCase("pt-BR")}`}
          />
          <div role="listbox" aria-label={label}>
            {groups.length ? (
              groups.map(([letter, group]) => (
                <section key={letter}>
                  <b>{letter}</b>
                  {group?.map((item) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.name === value}
                      key={item.code}
                      onClick={() => {
                        onChange(item.name);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </section>
              ))
            ) : (
              <p>Nenhum resultado encontrado.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
