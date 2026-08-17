import {
  Excalidraw,
  LiveCollaborationTrigger,
  CaptureUpdateAction,
  reconcileElements,
  useEditorInterface,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@excalidraw/excalidraw/components/ShareableLinkDialog";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isDevEnv,
  getFormFactor,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  usersIcon,
  exportToPlus,
  share,
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import {
  isArrowElement,
  isInitializedImageElement,
  newElementWith,
} from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import {
  ExportToExcalidrawPlus,
  exportToExcalidrawPlus,
} from "./components/ExportToExcalidrawPlus";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import {
  ENGINE_ACCENTS,
  deriveAccentShades,
  type EngineId,
} from "./syntropy/engineAccents";
import {
  createSyntropyWire,
  deleteSyntropyWire,
} from "./syntropy/createSyntropyWire";
import { LibraryPanel } from "./syntropy/LibraryPanel";
import { ChromeRail } from "./syntropy/ChromeRail";
import { PenPresets } from "./syntropy/PenPresets";
import { NodeOverlay } from "./syntropy/NodeOverlay";

import "./syntropy/boardChrome.scss";

import {
  exportToBackend,
  getCollaborationLinkData,
  importFromBackend,
  isCollaborationLink,
} from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage,
} from "./data/localStorage";

import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import { AIComponents } from "./components/AI";
import { ExcalidrawPlusIframeExport } from "./ExcalidrawPlusIframeExport";

import "./index.scss";

import { AppSidebar } from "./components/AppSidebar";

import type { CollabAPI } from "./collab/Collab";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

// The library panel renders as a 240px flex sibling of <Excalidraw>, so
// Excalidraw's own container is 240px narrower than the real window and it
// picks the tablet/mobile form factor on ordinary laptops. We add this back
// before Excalidraw's own getFormFactor so the breakpoint matches the window.
// Must match .LibraryPanel { width } in LibraryPanel.scss.
const LIBRARY_PANEL_WIDTH = 300;

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = importFromLocalStorage();

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonBackendMatch) {
        const imported = await importFromBackend(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
        );

        scene = {
          elements: bumpElementVersions(
            restoreElements(imported.elements, null, {
              repairBindings: true,
              deleteInvisibleElements: true,
            }),
            localDataState?.elements,
          ),
          appState: restoreAppState(
            imported.appState,
            // local appState when importing from backend to ensure we restore
            // localStorage user settings which we do not persist on server.
            localDataState?.appState,
          ),
        };
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      // https://github.com/excalidraw/excalidraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");
  const [activeEngineId, setActiveEngineId] = useState<EngineId | null>(null);
  const [isLibraryPanelOpen, setIsLibraryPanelOpen] = useState(true);
  // Lifted out of PaperPicker so ChromeRail can render its trigger segment
  // as part of the merged rail instead of PaperPicker owning its own chip.
  const [isPaperPickerOpen, setIsPaperPickerOpen] = useState(false);
  // NodeOverlay (Task 8): the scene elements and appState the overlay reads to position
  // SyntropyNodeCards in screen space, refreshed on every Excalidraw onChange below.
  const [overlayElements, setOverlayElements] = useState<
    readonly OrderedExcalidrawElement[]
  >([]);
  const [overlayAppState, setOverlayAppState] = useState<AppState | null>(null);
  // onChange fires on every pointermove during a drag/selection. The overlay
  // position sync and wire auto-styling below are visual/idempotent, so we
  // coalesce them to once per animation frame instead of running the full
  // O(elements) + O(nodes x arrows) pass on every single onChange call —
  // that per-frame cost was the main source of drag/selection lag.
  const pendingOverlaySyncRef = useRef<{
    elements: readonly OrderedExcalidrawElement[];
    appState: AppState;
  } | null>(null);
  const overlaySyncRafRef = useRef<number | null>(null);
  // Tracks whether the scene held any Syntropy node on the last sync, so onChange can skip
  // scheduling overlay work entirely while there's nothing for the overlay to show. Without this,
  // a scene with zero Syntropy nodes still pays for a NodeOverlay re-render (incl. its
  // getBoundingClientRect port re-measure) on every animation frame during an ordinary freehand
  // stroke — pencil input is the highest-frequency onChange source there is, so that per-frame
  // forced-layout cost was landing exactly where it stutters most.
  const hadSyntropyNodesRef = useRef(false);
  // Syntropy Canvas: no collaboration server is configured for v0 (deprioritized —
  // see docs/superpowers/specs/2026-08-04-math-canvas-design.md), so this is
  // unconditionally disabled rather than only inside an iframe.
  const isCollabDisabled = true;

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  const editorInterface = useEditorInterface();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }

      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          if (fileIds.length) {
            // Direct Firebase call (not through FileManager), so track manually
            FileStatusStore.updateStatuses(
              fileIds.map((id) => [id, "loading"]),
            );
          }
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
            FileStatusStore.updateStatuses([
              ...loadedFiles.map((f) => [f.id, "loaded"] as [FileId, "loaded"]),
              ...[...erroredFiles.keys()].map(
                (id) => [id, "error"] as [FileId, "error"],
              ),
            ]);
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(async ({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({
            currentFileIds: fileIds,
          });
        }
      }
    },
    [collabAPI, excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    initializeScene({ collabAPI, excalidrawAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ collabAPI, excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          collabAPI?.setUsername(username || "");
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [isCollabDisabled, collabAPI, excalidrawAPI, setLangCode, loadImages]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  // Flushes the coalesced overlay-position-sync + wire-auto-styling work
  // (see pendingOverlaySyncRef above). Runs at most once per animation frame
  // no matter how many onChange calls land in that frame.
  const flushOverlaySync = () => {
    overlaySyncRafRef.current = null;
    const pending = pendingOverlaySyncRef.current;
    if (!pending) {
      return;
    }
    pendingOverlaySyncRef.current = null;
    const { elements, appState } = pending;

    // NodeOverlay (Task 8): keep the overlay's view of the scene current so cards track
    // each node's screen position on every pan/zoom/move.
    setOverlayElements(elements);
    setOverlayAppState(appState);

    const selectedSyntropyEngine = elements
      .filter((el) => appState.selectedElementIds[el.id])
      .map(
        (el) =>
          (
            el.customData as
              | { syntropyNode?: { engineId: EngineId } }
              | undefined
          )?.syntropyNode?.engineId,
      )
      .find((engineId): engineId is EngineId => Boolean(engineId));
    setActiveEngineId(selectedSyntropyEngine ?? null);
  };

  useEffect(() => {
    return () => {
      if (overlaySyncRafRef.current !== null) {
        cancelAnimationFrame(overlaySyncRafRef.current);
      }
    };
  }, []);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const hasSyntropyNodes = elements.some(
      (el) =>
        (el.customData as { syntropyNode?: unknown } | undefined)?.syntropyNode,
    );
    // Nothing to position/recompute and there wasn't a moment ago either — skip the overlay sync
    // entirely rather than scheduling a rAF flush that will just re-render an unchanged empty
    // overlay. Once a node exists (or existed last frame, so its removal still gets synced once),
    // this falls through to the normal coalesced path below.
    if (hasSyntropyNodes || hadSyntropyNodesRef.current) {
      hadSyntropyNodesRef.current = hasSyntropyNodes;
      pendingOverlaySyncRef.current = { elements, appState };
      if (overlaySyncRafRef.current === null) {
        overlaySyncRafRef.current = requestAnimationFrame(flushOverlaySync);
      }
    }

    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  // NodeOverlay (Task 8): writes a SyntropyNodeCard scrub-chip edit back onto the underlying
  // embeddable element's customData.syntropyNode.inputs, so the value persists, undoes, and
  // exports with the element. captureUpdate: NEVER — typing into a scrub chip fires on every
  // keystroke, and each one becoming a separate undo step would make undo useless for this node
  // (same reasoning the wire auto-styling above applies).
  const handleNodeInputsChange = useCallback(
    (elementId: string, inputs: Record<string, unknown>) => {
      if (!excalidrawAPI) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const next = elements.map((el) => {
        if (el.id !== elementId || !el.customData?.syntropyNode) {
          return el;
        }
        return newElementWith(el, {
          customData: {
            ...el.customData,
            syntropyNode: { ...el.customData.syntropyNode, inputs },
          },
        });
      });
      excalidrawAPI.updateScene({
        elements: next,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [excalidrawAPI],
  );

  // NodeOverlay (auto-fit): a node's rendered content outgrew its last-committed box — grow the
  // underlying embeddable element to match (see NodeOverlay.tsx's scrollWidth/scrollHeight
  // effect). captureUpdate: NEVER for the same reason as handleNodeInputsChange above — this
  // fires from content measurement, not a deliberate user action, so it shouldn't cost its own
  // undo step.
  const handleNodeResize = useCallback(
    (elementId: string, width: number, height: number) => {
      if (!excalidrawAPI) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const next = elements.map((el) => {
        if (el.id !== elementId || !el.customData?.syntropyNode) {
          return el;
        }
        return newElementWith(el, { width, height });
      });
      excalidrawAPI.updateScene({
        elements: next,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [excalidrawAPI],
  );

  // NodeOverlay: a drag from an output port dot was released over a compatible input port dot —
  // create the real connection. CaptureUpdateAction.IMMEDIATELY (createSyntropyWire's own
  // default) since this is a discrete, deliberate action — same as adding a node — not a
  // per-keystroke live edit, so it should be its own undo step.
  const handleCreateWire = useCallback(
    (
      sourceNodeId: string,
      sourceOutputKey: string,
      targetNodeId: string,
      targetInputKey: string,
    ) => {
      if (!excalidrawAPI) {
        return;
      }
      createSyntropyWire(excalidrawAPI, {
        sourceNodeId,
        sourceOutputKey,
        targetNodeId,
        targetInputKey,
      });
    },
    [excalidrawAPI],
  );

  // NodeOverlay: the user clicked a connection curve (selecting it) and pressed Delete/Backspace.
  const handleDeleteWire = useCallback(
    (arrowId: string) => {
      if (!excalidrawAPI) {
        return;
      }
      deleteSyntropyWire(excalidrawAPI, arrowId);
    },
    [excalidrawAPI],
  );

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  const onExportToBackend = async (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage } = await exportToBackend(
        exportedElements,
        {
          ...appState,
          viewBackgroundColor: appState.exportBackground
            ? appState.viewBackgroundColor
            : getDefaultAppState().viewBackgroundColor,
        },
        files,
      );

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio,
        });
        throw new Error(error.message);
      }
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  // ---------------------------------------------------------------------------
  // onExport — intercepts file save to wait for pending image loads
  // ---------------------------------------------------------------------------
  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      // Yield initial progress
      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      // Wait for all pending images to finish
      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  // const onExport = () => {
  //   return new Promise((r) => setTimeout(r, 2500));
  //   // console.log("onExport");
  // };

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  return (
    <div
      style={{ height: "100%", display: "flex" }}
      // Mirror the resolved theme onto .syntropy-app so the shell chrome —
      // LibraryPanel, ChromeRail (Library/Paper/Theme), NodeOverlay
      // (the Syntropy node cards) — which all render as SIBLINGS of
      // <Excalidraw> (outside its .excalidraw.theme--xxx subtree) can pick up
      // theme tokens. index.scss re-publishes the chrome-relevant tokens under
      // .syntropy-app.theme--light/dark; the accent ramp below targets the
      // same classes. Without this, the chrome is theme-blind.
      className={clsx("syntropy-app", `theme--${editorTheme}`, {
        "is-collaborating": isCollaborating,
      })}
    >
      {isLibraryPanelOpen && <LibraryPanel excalidrawAPI={excalidrawAPI} />}
      {/* Mobile-only scrim behind the library drawer (see LibraryPanel.scss):
          display:none above 900px, so this is a no-op on desktop. On phone/tablet
          a tap on the exposed canvas closes the drawer. */}
      {isLibraryPanelOpen && (
        <button
          type="button"
          aria-label="Close library"
          className="LibraryPanel__scrim"
          onClick={() => setIsLibraryPanelOpen(false)}
        />
      )}
      <ChromeRail
        excalidrawAPI={excalidrawAPI}
        libraryOpen={isLibraryPanelOpen}
        onLibraryToggle={() => setIsLibraryPanelOpen((prev) => !prev)}
        paperOpen={isPaperPickerOpen}
        onPaperToggle={() => setIsPaperPickerOpen((prev) => !prev)}
        onPaperClose={() => setIsPaperPickerOpen(false)}
        appTheme={appTheme}
        onThemeChange={setAppTheme}
      />
      <PenPresets excalidrawAPI={excalidrawAPI} />
      {overlayAppState && (
        <NodeOverlay
          elements={overlayElements}
          arrows={overlayElements.filter(isArrowElement)}
          appState={overlayAppState}
          onNodeInputsChange={handleNodeInputsChange}
          onCreateWire={handleCreateWire}
          onDeleteWire={handleDeleteWire}
          onNodeResize={handleNodeResize}
        />
      )}
      <div
        style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}
      >
        {/* Always inject the toolbar's --color-primary ramp so tool-icon selected states stay
            on the lab palette at all times (note-taker: "the color is very bad... non consistent
            as a design"). Defaults to the flagship lab teal when no Syntropy node is selected;
            switches to the selected node's engine accent when one is. Emitted for BOTH themes so
            the accent (and selection/active states) follow the mood across the whole UI, not just
            dark — the cascade picks the block matching the .theme--dark / .theme--light class
            Excalidraw puts on its wrapper. */}
        <style>
          {(() => {
            const accent = activeEngineId
              ? ENGINE_ACCENTS[activeEngineId]
              : "#5c939f";
            const dark = deriveAccentShades(accent, "dark");
            const light = deriveAccentShades(accent, "light");
            const ramp = (s: typeof dark) => `
              --color-primary: ${s.primary};
              --color-primary-darker: ${s.primaryDarker};
              --color-primary-darkest: ${s.primaryDarkest};
              --color-primary-light: ${s.primaryLight};
              --color-primary-light-darker: ${s.primaryLightDarker};
              --color-primary-hover: ${s.primaryHover};
              --color-brand-hover: ${s.brandHover};
              --color-brand-active: ${s.brandActive};
              --color-on-primary-container: ${s.onPrimaryContainer};
              --color-surface-primary-container: ${s.surfacePrimaryContainer};
              --color-selection: ${s.selection};
            `;
            return `.excalidraw.theme--dark, .syntropy-app.theme--dark {${ramp(
              dark,
            )}}
              .excalidraw.theme--light, .syntropy-app.theme--light {${ramp(
                light,
              )}}`;
          })()}
        </style>
        <Excalidraw
          onChange={onChange}
          onExport={onExport}
          initialData={initialStatePromiseRef.current.promise}
          isCollaborating={isCollaborating}
          onPointerUpdate={collabAPI?.onPointerUpdate}
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
              export: {
                onExportToBackend,
                renderCustomUI: excalidrawAPI
                  ? (elements, appState, files) => {
                      return (
                        <ExportToExcalidrawPlus
                          elements={elements}
                          appState={appState}
                          files={files}
                          name={excalidrawAPI.getName()}
                          onError={(error) => {
                            excalidrawAPI?.updateScene({
                              appState: {
                                errorMessage: error.message,
                              },
                            });
                          }}
                          onSuccess={() => {
                            excalidrawAPI.updateScene({
                              appState: { openDialog: null },
                            });
                          }}
                        />
                      );
                    }
                  : undefined,
              },
            },
            // Only compensate for the library column's width when it's actually mounted and
            // stealing that space (isLibraryPanelOpen — see LIBRARY_PANEL_WIDTH above). Adding it
            // unconditionally, even while the panel is closed and Excalidraw's container already
            // spans the full window, was inflating editorWidth on every iPad-width screen and
            // permanently locking in the "desktop" form factor — which is what native Excalidraw
            // uses to decide when its own panels reflow to avoid colliding on a small screen.
            getFormFactor: (editorWidth, editorHeight) =>
              getFormFactor(
                editorWidth + (isLibraryPanelOpen ? LIBRARY_PANEL_WIDTH : 0),
                editorHeight,
              ),
          }}
          langCode={langCode}
          renderCustomStats={renderCustomStats}
          detectScroll={false}
          handleKeyboardGlobally={true}
          autoFocus={true}
          theme={editorTheme}
          onThemeChange={setAppTheme}
          renderTopRightUI={(isMobile) => {
            if (isMobile || !collabAPI || isCollabDisabled) {
              return null;
            }

            return (
              <div className="excalidraw-ui-top-right">
                {collabError.message && (
                  <CollabError collabError={collabError} />
                )}
                <LiveCollaborationTrigger
                  isCollaborating={isCollaborating}
                  onSelect={() =>
                    setShareDialogState({ isOpen: true, type: "share" })
                  }
                  editorInterface={editorInterface}
                />
              </div>
            );
          }}
          onLinkOpen={(element, event) => {
            if (element.link && isElementLink(element.link)) {
              event.preventDefault();
              excalidrawAPI?.setViewport({
                target: element.link,
                fit: "scale-down",
                animation: true,
              });
            }
          }}
          validateEmbeddable={(link) =>
            link.startsWith("syntropy://") ? true : undefined
          }
          renderEmbeddable={(element) => {
            const syntropyNode = (
              element.customData as
                | {
                    syntropyNode?: {
                      engineId: EngineId;
                      methodId: string;
                      name: string;
                      linkedAccent?: string | null;
                    };
                  }
                | undefined
            )?.syntropyNode;
            if (!syntropyNode) {
              return null;
            }
            // All Syntropy nodes render through NodeOverlay — a DOM layer outside this component
            // tree, not subject to the pointer-events:none !important gate embeddable content is
            // under (packages/excalidraw/css/styles.scss). Excalidraw still selects/drags/resizes
            // this element normally (packages/element/src/renderElement.ts draws embeddable elements
            // on the static canvas independent of what renderEmbeddable returns); NodeOverlay renders
            // the interactive card for port-spec methods and the SyntropyNode shell (with a working
            // Open button) for the rest.
            //
            // IMPORTANT: we return an empty fragment, NOT null. App.tsx (packages/excalidraw/
            // components/App.tsx ~L2023) renders `renderEmbeddable?.(el) ?? <iframe src={src.link}/>`,
            // and the element's link is "syntropy://node/…" (set in createSyntropyNode only so
            // validateEmbeddable accepts it). `null` is nullish, so `null ?? <iframe/>` falls through
            // to an iframe that loads the syntropy:// protocol — which the browser hands to the OS
            // protocol handler, producing an "open xdg-open?" prompt on every render/refresh. An
            // empty fragment is non-nullish, so the `??` short-circuits and no iframe is created.
            return <></>;
          }}
        >
          <AppMainMenu
            onCollabDialogOpen={onCollabDialogOpen}
            isCollaborating={isCollaborating}
            isCollabEnabled={!isCollabDisabled}
            theme={appTheme}
            refresh={() => forceRefresh((prev) => !prev)}
          />
          {/* No welcome screen: Syntropy Canvas opens straight onto an empty board. Stock
              Excalidraw's version covered the canvas with hint arrows ("Pick a tool & Start
              drawing!", "To move canvas, hold Scroll wheel"), a centered logo/heading block,
              and an Open/Help menu — none of which belong on a lecture board, and all of which
              dominated the top of the frame. */}
          <OverwriteConfirmDialog>
            <OverwriteConfirmDialog.Actions.ExportToImage />
            <OverwriteConfirmDialog.Actions.SaveToDisk />
            {excalidrawAPI && (
              <OverwriteConfirmDialog.Action
                title={t("overwriteConfirm.action.excalidrawPlus.title")}
                actionLabel={t("overwriteConfirm.action.excalidrawPlus.button")}
                onClick={() => {
                  exportToExcalidrawPlus(
                    excalidrawAPI.getSceneElements(),
                    excalidrawAPI.getAppState(),
                    excalidrawAPI.getFiles(),
                    excalidrawAPI.getName(),
                  );
                }}
              >
                {t("overwriteConfirm.action.excalidrawPlus.description")}
              </OverwriteConfirmDialog.Action>
            )}
          </OverwriteConfirmDialog>
          <AppFooter onChange={() => excalidrawAPI?.refresh()} />
          {excalidrawAPI && <AIComponents excalidrawAPI={excalidrawAPI} />}

          {isCollaborating && isOffline && (
            <div className="alertalert--warning">
              {t("alerts.collabOfflineWarning")}
            </div>
          )}
          {localStorageQuotaExceeded && (
            <div className="alert alert--danger">
              {t("alerts.localStorageQuotaExceeded")}
            </div>
          )}
          {latestShareableLink && (
            <ShareableLinkDialog
              link={latestShareableLink}
              onCloseRequest={() => setLatestShareableLink(null)}
              setErrorMessage={setErrorMessage}
            />
          )}
          {excalidrawAPI && !isCollabDisabled && (
            <Collab excalidrawAPI={excalidrawAPI} />
          )}

          <ShareDialog
            collabAPI={collabAPI}
            onExportToBackend={async () => {
              if (excalidrawAPI) {
                try {
                  await onExportToBackend(
                    excalidrawAPI.getSceneElements(),
                    excalidrawAPI.getAppState(),
                    excalidrawAPI.getFiles(),
                  );
                } catch (error: any) {
                  setErrorMessage(error.message);
                }
              }
            }}
          />

          <AppSidebar />

          {errorMessage && (
            <ErrorDialog onClose={() => setErrorMessage("")}>
              {errorMessage}
            </ErrorDialog>
          )}

          <CommandPalette
            customCommandPaletteItems={[
              {
                label: t("labels.liveCollaboration"),
                category: DEFAULT_CATEGORIES.app,
                keywords: [
                  "team",
                  "multiplayer",
                  "share",
                  "public",
                  "session",
                  "invite",
                ],
                icon: usersIcon,
                perform: () => {
                  setShareDialogState({
                    isOpen: true,
                    type: "collaborationOnly",
                  });
                },
              },
              {
                label: t("roomDialog.button_stopSession"),
                category: DEFAULT_CATEGORIES.app,
                predicate: () => !!collabAPI?.isCollaborating(),
                keywords: [
                  "stop",
                  "session",
                  "end",
                  "leave",
                  "close",
                  "exit",
                  "collaboration",
                ],
                perform: () => {
                  if (collabAPI) {
                    collabAPI.stopCollaboration();
                    if (!collabAPI.isCollaborating()) {
                      setShareDialogState({ isOpen: false });
                    }
                  }
                },
              },
              {
                label: t("labels.share"),
                category: DEFAULT_CATEGORIES.app,
                predicate: true,
                icon: share,
                keywords: [
                  "link",
                  "shareable",
                  "readonly",
                  "export",
                  "publish",
                  "snapshot",
                  "url",
                  "collaborate",
                  "invite",
                ],
                perform: async () => {
                  setShareDialogState({ isOpen: true, type: "share" });
                },
              },
              // GitHub/X/Discord/YouTube commands, and the "Excalidraw+"/"Sign up" upsell
              // commands, removed — those pointed at Excalidraw's own community/product, which
              // this fork has no equivalent of. Re-add once there's a real destination rather
              // than linking out to someone else's. The "Export to Excalidraw+" command below
              // is left as-is — it's a working export feature, not a promotional link.
              {
                label: t("overwriteConfirm.action.excalidrawPlus.button"),
                category: DEFAULT_CATEGORIES.export,
                icon: exportToPlus,
                predicate: true,
                keywords: ["plus", "export", "save", "backup"],
                perform: () => {
                  if (excalidrawAPI) {
                    exportToExcalidrawPlus(
                      excalidrawAPI.getSceneElements(),
                      excalidrawAPI.getAppState(),
                      excalidrawAPI.getFiles(),
                      excalidrawAPI.getName(),
                    );
                  }
                },
              },
              {
                label: t("labels.installPWA"),
                category: DEFAULT_CATEGORIES.app,
                predicate: () => !!pwaEvent,
                perform: () => {
                  if (pwaEvent) {
                    pwaEvent.prompt();
                    pwaEvent.userChoice.then(() => {
                      // event cannot be reused, but we'll hopefully
                      // grab new one as the event should be fired again
                      pwaEvent = null;
                    });
                  }
                },
              },
            ]}
          />
          {isVisualDebuggerEnabled() && excalidrawAPI && (
            <DebugCanvas
              appState={excalidrawAPI.getAppState()}
              scale={window.devicePixelRatio}
              ref={debugCanvasRef}
            />
          )}
        </Excalidraw>
      </div>
    </div>
  );
};

const ExcalidrawApp = () => {
  const isCloudExportWindow =
    window.location.pathname === "/excalidraw-plus-export";
  if (isCloudExportWindow) {
    return <ExcalidrawPlusIframeExport />;
  }

  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawAPIProvider>
          <ExcalidrawWrapper />
        </ExcalidrawAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
