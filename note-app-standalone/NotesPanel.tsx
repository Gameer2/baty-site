import { useState } from "react";

import "./NotesPanel.scss";

import { listNotes, createNote, renameNote, deleteNote } from "../data/notes";

import type { NoteMeta } from "../data/notes";

type NotesPanelProps = {
  activeNoteId: string;
  onSwitchNote: (noteId: string) => void;
};

/**
 * The document layer's UI: a flat, searchable list of notes — create, rename, delete, switch.
 * Mirrors syntropy/LibraryPanel.tsx's shell (sticky head + search, same left-column slot,
 * mutually exclusive with it — see ChromeRail.tsx) since that's this app's established "browse
 * a list of things" pattern, rather than inventing a second one. Unlike LibraryPanel this list
 * has no engines/categories to group by — just notes, newest-edited first (see data/notes.ts).
 */
export const NotesPanel = ({ activeNoteId, onSwitchNote }: NotesPanelProps) => {
  const [notes, setNotes] = useState<NoteMeta[]>(() => listNotes());
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const refresh = () => setNotes(listNotes());

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? notes.filter((note) => note.name.toLowerCase().includes(trimmedQuery))
    : notes;

  const handleCreate = () => {
    const note = createNote("Untitled");
    refresh();
    onSwitchNote(note.id);
  };

  const startRename = (note: NoteMeta) => {
    setEditingId(note.id);
    setEditingName(note.name);
  };

  const commitRename = () => {
    if (editingId) {
      const trimmed = editingName.trim();
      if (trimmed) {
        renameNote(editingId, trimmed);
      }
      refresh();
    }
    setEditingId(null);
  };

  const handleDelete = (note: NoteMeta) => {
    // Never leave the app with zero notes — there'd be nothing left to switch to.
    if (notes.length <= 1) {
      return;
    }
    if (!window.confirm(`Delete "${note.name}"? This can't be undone.`)) {
      return;
    }
    deleteNote(note.id);
    if (note.id === activeNoteId) {
      const remaining = listNotes();
      onSwitchNote(remaining[0].id);
    }
    refresh();
  };

  return (
    <div className="NotesPanel">
      <div className="NotesPanel__head">
        <div className="NotesPanel__eyebrow">Notes</div>
        <input
          type="search"
          className="NotesPanel__searchInput"
          placeholder="Search notes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search notes"
        />
        <button
          type="button"
          className="NotesPanel__new"
          onClick={handleCreate}
        >
          + New note
        </button>
      </div>

      {filtered.length === 0 && (
        <p className="NotesPanel__empty">
          {trimmedQuery
            ? `No note matches “${query.trim()}”.`
            : "No notes yet."}
        </p>
      )}

      {filtered.map((note) => {
        const isActive = note.id === activeNoteId;
        const isEditing = editingId === note.id;
        return (
          <div
            key={note.id}
            className={`NotesPanel__item${
              isActive ? " NotesPanel__item--active" : ""
            }`}
          >
            {isEditing ? (
              <input
                type="text"
                className="NotesPanel__renameInput"
                value={editingName}
                autoFocus
                onChange={(event) => setEditingName(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitRename();
                  }
                  if (event.key === "Escape") {
                    setEditingId(null);
                  }
                }}
              />
            ) : (
              // A double-click-to-rename on this same button doesn't work: onClick (switch)
              // always fires first for a double-click, and switching remounts this whole panel
              // before the browser's dblclick event can land on the (now-destroyed) button — so
              // rename gets its own dedicated button instead of overloading this one.
              <button
                type="button"
                className="NotesPanel__itemButton"
                onClick={() => onSwitchNote(note.id)}
              >
                <span className="NotesPanel__itemName">{note.name}</span>
                <span className="NotesPanel__itemDate">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </span>
              </button>
            )}
            {!isEditing && (
              <button
                type="button"
                className="NotesPanel__itemRename"
                title={`Rename "${note.name}"`}
                aria-label={`Rename "${note.name}"`}
                onClick={() => startRename(note)}
              >
                ✎
              </button>
            )}
            {!isEditing && notes.length > 1 && (
              <button
                type="button"
                className="NotesPanel__itemDelete"
                title={`Delete "${note.name}"`}
                aria-label={`Delete "${note.name}"`}
                onClick={() => handleDelete(note)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
