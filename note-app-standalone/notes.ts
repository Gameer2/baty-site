/**
 * The document layer: turns the app's original single, fixed-key scene ("excalidraw" /
 * "excalidraw-state" in localStorage — one canvas for the whole app, forever) into a library of
 * separate, named notes. Each note is still a single un-paginated canvas internally — nothing
 * about *within*-note behavior changes — this only adds an *across*-notes layer on top: an index
 * of {id, name, createdAt, updatedAt}, and per-note storage keys instead of the old fixed ones.
 *
 * Deliberately reuses localStorage for each note's elements/appState (not IndexedDB) — same
 * mechanism the app always used for scene data, same size characteristics, so this is additive
 * (namespacing what was already there) rather than a second persistence system to keep in sync.
 * Files/images stay in the existing shared IndexedDB file store (data/LocalData.ts) — they're
 * already content-addressed by FileId, so sharing that store across notes is a feature (dedup),
 * not a bug, and touching it isn't necessary for this pass.
 */
import { STORAGE_KEYS } from "../app_constants";

export type NoteMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

const NOTES_INDEX_KEY = "excalidraw-notes-index";
const ACTIVE_NOTE_LS_KEY = "excalidraw-active-note";
const NOTE_URL_PARAM = "note";

const readIndex = (): NoteMeta[] => {
  try {
    const raw = localStorage.getItem(NOTES_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to read the notes index", error);
    return [];
  }
};

const writeIndex = (notes: NoteMeta[]) => {
  try {
    localStorage.setItem(NOTES_INDEX_KEY, JSON.stringify(notes));
  } catch (error) {
    console.error("Failed to save the notes index", error);
  }
};

/** Newest-edited first — matches how every note-taking app's own switcher sorts. */
export const listNotes = (): NoteMeta[] =>
  readIndex().sort((a, b) => b.updatedAt - a.updatedAt);

export const getNoteElementsKey = (noteId: string) =>
  `${STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS}-note-${noteId}`;

export const getNoteAppStateKey = (noteId: string) =>
  `${STORAGE_KEYS.LOCAL_STORAGE_APP_STATE}-note-${noteId}`;

const generateNoteId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const createNote = (name = "Untitled"): NoteMeta => {
  const now = Date.now();
  const note: NoteMeta = {
    id: generateNoteId(),
    name,
    createdAt: now,
    updatedAt: now,
  };
  writeIndex([...readIndex(), note]);
  return note;
};

export const renameNote = (id: string, name: string) => {
  writeIndex(
    readIndex().map((note) =>
      note.id === id ? { ...note, name, updatedAt: Date.now() } : note,
    ),
  );
};

/** Called on every save so "newest edited first" in the switcher stays accurate. */
export const touchNote = (id: string) => {
  writeIndex(
    readIndex().map((note) =>
      note.id === id ? { ...note, updatedAt: Date.now() } : note,
    ),
  );
};

export const deleteNote = (id: string) => {
  writeIndex(readIndex().filter((note) => note.id !== id));
  try {
    localStorage.removeItem(getNoteElementsKey(id));
    localStorage.removeItem(getNoteAppStateKey(id));
  } catch (error) {
    console.error("Failed to remove a deleted note's stored scene", error);
  }
};

/**
 * The URL is the source of truth when present (so reload/back-forward/bookmarking a specific
 * note all work for free); a plain localStorage pointer is the fallback for opening the app
 * fresh with no `?note=` param (e.g. from a bookmark to the bare origin, or the PWA icon).
 */
export const getActiveNoteId = (): string | null => {
  const fromUrl = new URLSearchParams(window.location.search).get(
    NOTE_URL_PARAM,
  );
  if (fromUrl) {
    return fromUrl;
  }
  try {
    return localStorage.getItem(ACTIVE_NOTE_LS_KEY);
  } catch {
    return null;
  }
};

export const setActiveNoteId = (id: string) => {
  try {
    localStorage.setItem(ACTIVE_NOTE_LS_KEY, id);
  } catch (error) {
    console.error("Failed to remember the active note", error);
  }
  const url = new URL(window.location.href);
  url.searchParams.set(NOTE_URL_PARAM, id);
  window.history.replaceState({}, "", url);
};

/**
 * One-time migration: the app's very first users have real content sitting in the old
 * fixed-key storage (STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS/_APP_STATE) from before notes existed.
 * If the notes index is still empty and that old content is real (non-empty elements array),
 * wrap it as the first note instead of it silently vanishing the moment this ships. Only clears
 * the legacy keys after the copy actually lands in the new per-note keys.
 */
const migrateLegacySceneIfNeeded = (): NoteMeta | null => {
  if (readIndex().length > 0) {
    return null;
  }

  let legacyElements: string | null = null;
  try {
    legacyElements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
  } catch (error) {
    console.error("Failed to read legacy scene for migration", error);
    return null;
  }
  if (!legacyElements) {
    return null;
  }

  try {
    const parsed = JSON.parse(legacyElements);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
  } catch {
    return null;
  }

  const legacyAppState = localStorage.getItem(
    STORAGE_KEYS.LOCAL_STORAGE_APP_STATE,
  );
  const note = createNote("My notes");
  try {
    localStorage.setItem(getNoteElementsKey(note.id), legacyElements);
    if (legacyAppState) {
      localStorage.setItem(getNoteAppStateKey(note.id), legacyAppState);
    }
    localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
  } catch (error) {
    console.error("Failed to migrate the legacy scene into a note", error);
  }
  return note;
};

/**
 * Resolves which note should be open right now, migrating legacy content and/or creating a
 * first note if needed. Call once, synchronously, before initializeScene runs — everything
 * downstream (importFromLocalStorage, LocalData's save) assumes getActiveNoteId() already
 * points at a real note.
 */
export const ensureActiveNote = (): NoteMeta => {
  const migrated = migrateLegacySceneIfNeeded();
  if (migrated) {
    setActiveNoteId(migrated.id);
    return migrated;
  }

  const notes = listNotes();
  const activeId = getActiveNoteId();
  const active = activeId && notes.find((note) => note.id === activeId);
  if (active) {
    // Always resync the URL, even when the active id only came from the localStorage
    // fallback (no `?note=` in the URL this load) — otherwise a plain reload of the bare
    // origin resolves the right note but never reflects it in the URL, so refresh/bookmark
    // stops round-tripping after the very first visit.
    setActiveNoteId(active.id);
    return active;
  }

  if (notes.length > 0) {
    setActiveNoteId(notes[0].id);
    return notes[0];
  }

  const note = createNote("Untitled");
  setActiveNoteId(note.id);
  return note;
};
