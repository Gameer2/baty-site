import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import { KEYS, capitalizeString } from "@excalidraw/common";

import type { PointerType } from "@excalidraw/element/types";

import { trackEvent } from "../analytics";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { t } from "../i18n";
import { getShortcutKey } from "../shortcut";

import { IconButton } from "./IconButton";
import { ToolPopover } from "./ToolPopover";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import {
  SelectionIcon,
  RectangleIcon,
  DiamondIcon,
  PolygonIcon,
  Shape3DIcon,
  EllipseIcon,
  ArrowIcon,
  LineIcon,
  FreedrawIcon,
  drawShapeToolIcon,
  TextIcon,
  ImageIcon,
  VideoIcon,
  PdfIcon,
  EraserIcon,
  laserPointerToolIcon,
  bucketFillIcon,
  LassoIcon,
  handIcon,
  frameToolIcon,
  EmbedIcon,
  compassIcon,
  rulerIcon,
  protractorIcon,
  tSquareIcon,
  setSquareIcon,
  angleBisectorIcon,
  engineeringToolsIcon,
  shapeFamilyIcon,
  importToolsIcon,
} from "./icons";

import type {
  AppClassProperties,
  AppProps,
  AppState,
  ToolType,
  UIAppState,
} from "../types";

export type ToolConfig = {
  icon: React.ReactNode;
  /** letter shortcut(s) — the first one is shown in tooltips */
  letterKey?: string | readonly string[];
  /** whether `letterKey` requires Shift to be held (e.g. Shift+X) */
  shiftKey?: boolean;
  numericKey?: string;
  /** whether the tool's shapes can be filled — fills the icon when active */
  fillable?: boolean;
  /**
   * re-activating the tool switches back to the previously active tool
   * (via the keyboard shortcut or ESC — see `setActiveTool`'s `toggle`
   * option)
   */
  toggle?: boolean;
};

/** preserves the exact keys while typing every entry as ToolConfig */
const defineTools = <T extends Record<string, ToolConfig>>(tools: T) =>
  tools as { [K in keyof T]: ToolConfig };

/**
 * Tool data — the single source of truth for tool buttons, keyboard
 * shortcuts (`findShapeByKey`), and the command palette. Toolbar placement
 * is not defined here: toolbars compose the `*ToolButton` components below
 * manually, so entries without a toolbar slot (e.g. laser) are data-only.
 */
export const TOOLS = defineTools({
  hand: {
    icon: handIcon,
    letterKey: KEYS.H,
    toggle: true,
  },
  selection: {
    icon: SelectionIcon,
    letterKey: KEYS.V,
    numericKey: KEYS["1"],
    fillable: true,
  },
  rectangle: {
    icon: RectangleIcon,
    letterKey: KEYS.R,
    numericKey: KEYS["2"],
    fillable: true,
  },
  diamond: {
    icon: DiamondIcon,
    letterKey: KEYS.D,
    numericKey: KEYS["3"],
    fillable: true,
  },
  polygon: {
    icon: PolygonIcon,
    letterKey: KEYS.C,
    fillable: true,
  },
  shape3d: {
    icon: Shape3DIcon,
    letterKey: KEYS.W,
    fillable: true,
  },
  ellipse: {
    icon: EllipseIcon,
    letterKey: KEYS.O,
    numericKey: KEYS["4"],
    fillable: true,
  },
  arrow: {
    icon: ArrowIcon,
    letterKey: KEYS.A,
    numericKey: KEYS["5"],
    fillable: true,
  },
  line: {
    icon: LineIcon,
    letterKey: KEYS.L,
    numericKey: KEYS["6"],
    fillable: true,
  },
  freedraw: {
    icon: FreedrawIcon,
    letterKey: [KEYS.P, KEYS.X],
    numericKey: KEYS["7"],
  },
  text: {
    icon: TextIcon,
    letterKey: KEYS.T,
    numericKey: KEYS["8"],
  },
  image: {
    icon: ImageIcon,
    numericKey: KEYS["9"],
  },
  video: {
    icon: VideoIcon,
  },
  pdf: {
    icon: PdfIcon,
  },
  eraser: {
    icon: EraserIcon,
    letterKey: KEYS.E,
    numericKey: KEYS["0"],
    toggle: true,
  },
  frame: {
    icon: frameToolIcon,
    letterKey: KEYS.F,
  },
  autoshape: {
    icon: drawShapeToolIcon,
    letterKey: KEYS.X,
    shiftKey: true,
    fillable: false,
  },
  embeddable: {
    icon: EmbedIcon,
  },
  laser: {
    icon: laserPointerToolIcon,
    letterKey: KEYS.K,
  },
  bucketfill: {
    icon: bucketFillIcon,
    letterKey: KEYS.B,
  },
  lasso: {
    icon: LassoIcon,
    fillable: false,
  },
  // engineering / drafting instruments — grouped behind one toolbar icon,
  // so they carry icon + label only (no keyboard shortcut): activation goes
  // through the EngineeringToolsDropdown, not `findShapeByKey`
  compass: {
    icon: compassIcon,
  },
  ruler: {
    icon: rulerIcon,
  },
  protractor: {
    icon: protractorIcon,
  },
  tsquare: {
    icon: tSquareIcon,
  },
  setsquare: {
    icon: setSquareIcon,
  },
  anglebisector: {
    icon: angleBisectorIcon,
  },
});

export type ToolbarToolType = keyof typeof TOOLS;

/**
 * tools that, when activated while already active, switch back to the
 * previously active tool (see `setActiveTool`'s `toggle` option)
 */
export const TOGGLE_TOOLS: readonly (ToolType | "custom")[] = (
  Object.keys(TOOLS) as ToolbarToolType[]
).filter((type) => TOOLS[type].toggle);

export const getToolLetter = (type: ToolbarToolType) => {
  const { letterKey, shiftKey } = TOOLS[type];
  if (!letterKey) {
    return letterKey;
  }
  const letter = capitalizeString(
    typeof letterKey === "string" ? letterKey : letterKey[0],
  );
  return shiftKey ? getShortcutKey(`Shift+${letter}`) : letter;
};

/** human-readable shortcut hint, e.g. "R or 2", used in tooltips & aria */
export const getToolShortcut = (type: ToolbarToolType) => {
  const letter = getToolLetter(type);
  const { numericKey } = TOOLS[type];
  return letter && numericKey != null
    ? `${letter} ${t("helpDialog.or")} ${numericKey}`
    : `${letter || numericKey}`;
};

export const findShapeByKey = (
  key: string,
  app: AppClassProperties,
  shiftKey: boolean = false,
) => {
  // CapsLock-insensitive: the caller excludes every modifier but shift, and
  // shift is matched explicitly below, so a capital letter on its own means
  // CapsLock
  const lowerKey = key.toLowerCase();

  for (const type of Object.keys(TOOLS) as ToolbarToolType[]) {
    const { letterKey, numericKey, shiftKey: requiresShift } = TOOLS[type];
    // shift-bound tools require shift; plain-bound ones require its absence
    if (shiftKey !== Boolean(requiresShift)) {
      continue;
    }
    if (
      (numericKey != null && key === numericKey) ||
      (letterKey &&
        (typeof letterKey === "string"
          ? letterKey === lowerKey
          : letterKey.includes(lowerKey)))
    ) {
      // the selection shortcut activates whichever selection tool the user
      // prefers (selection or lasso)
      return type === "selection"
        ? app.state.preferredSelectionTool.type
        : type;
    }
  }
  return null;
};

/**
 * Whether a toolbar entry activating the given tool renders disabled — true
 * when the active tool is host-controlled (`props.activeTool`) and the entry
 * doesn't activate the forced tool (`setActiveTool` refuses it).
 */
export const isToolButtonDisabled = (app: AppClassProperties, type: string) =>
  app.props.activeTool != null && app.props.activeTool.type !== type;

export type ToolButtonComponentProps = {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  /** hide the keybinding badge rendered in the button's corner */
  hideKeyBinding?: boolean;
  /**
   * hide all shortcut affordances (tooltip hint, aria-keyshortcuts, and the
   * keybinding badge) — used on mobile where there's no keyboard
   */
  hideShortcut?: boolean;
};

type ToolButtonBehavior = {
  /**
   * display the shortcut of another tool (tooltip, aria, keybinding badge) —
   * e.g. the lasso button shows the selection shortcut, which activates it
   * when lasso is the preferred selection tool
   */
  shortcutType?: ToolbarToolType;
  /**
   * custom activation — replaces the default track + `setActiveTool` (pen
   * detection still runs before it)
   */
  onSelect?: (
    app: AppClassProperties,
    data: { pointerType: PointerType | null },
  ) => void;
};

/**
 * Creates a toolbar button component for the given tool. Activation is
 * uniform: track + `setActiveTool` (recording the previous tool for toggle
 * tools), with pen detection on the first pen interaction.
 */
const createToolButton = (
  type: ToolbarToolType,
  behavior?: ToolButtonBehavior,
) => {
  const config = TOOLS[type];
  const shortcutType = behavior?.shortcutType ?? type;

  const ToolButtonComponent = ({
    app,
    activeTool,
    hideKeyBinding,
    hideShortcut,
  }: ToolButtonComponentProps) => {
    const label = capitalizeString(t(`toolBar.${type}`));
    const shortcut = hideShortcut ? null : getToolShortcut(shortcutType);

    return (
      <IconButton
        className={clsx({ fillable: config.fillable })}
        type="toggle"
        icon={config.icon}
        checked={activeTool.type === type}
        disabled={isToolButtonDisabled(app, type)}
        title={shortcut ? `${label} — ${shortcut}` : label}
        keyBindingLabel={
          hideKeyBinding || hideShortcut
            ? undefined
            : TOOLS[shortcutType].numericKey || getToolLetter(shortcutType)
        }
        aria-label={label}
        aria-keyshortcuts={shortcut ?? undefined}
        data-testid={`toolbar-${type}`}
        onSelect={({ pointerType }) => {
          if (!app.state.penDetected && pointerType === "pen") {
            app.togglePenMode(true);
          }

          if (behavior?.onSelect) {
            behavior.onSelect(app, { pointerType });
            return;
          }

          if (app.state.activeTool.type !== type) {
            trackEvent("toolbar", type, "ui");
            app.setActiveTool({ type });
          }
        }}
      />
    );
  };

  ToolButtonComponent.displayName = `${capitalizeString(type)}IconButton`;

  return ToolButtonComponent;
};

export const HandToolButton = createToolButton("hand");
export const ArrowToolButton = createToolButton("arrow");
export const LineToolButton = createToolButton("line");
export const FreedrawToolButton = createToolButton("freedraw");
export const TextToolButton = createToolButton("text");
export const ImageToolButton = createToolButton("image");
export const VideoToolButton = createToolButton("video");
export const PdfToolButton = createToolButton("pdf");
export const EraserToolButton = createToolButton("eraser");
export const FrameToolButton = createToolButton("frame");

/**
 * The selection tool button — pointer-clicking it while the selection tool
 * is active switches to lasso.
 */
export const SelectionToolButton = createToolButton("selection", {
  onSelect: (app, { pointerType }) => {
    if (app.state.activeTool.type === "selection" && pointerType !== null) {
      // pointer-clicking the active selection tool switches to lasso;
      // keyboard/AT activation stays on selection
      app.setActiveTool({ type: "lasso" });
      return;
    }

    if (app.state.activeTool.type !== "selection") {
      trackEvent("toolbar", "selection", "ui");
      app.setActiveTool({ type: "selection" });
    }
  },
});

/**
 * Rendered in place of the selection button when lasso is the preferred
 * selection tool; the selection shortcut activates it then.
 */
export const LassoToolButton = createToolButton("lasso", {
  shortcutType: "selection",
});

/**
 * The selection ⇄ lasso popover used in compact (tablet) and mobile
 * toolbars; picking an option also makes it the preferred selection tool.
 */
export const SelectionToolPopover = ({
  app,
  activeTool,
  setAppState,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const SELECTION_TOOLS = [
    {
      type: "selection",
      icon: TOOLS.selection.icon,
      fillable: TOOLS.selection.fillable,
      title: capitalizeString(t("toolBar.selection")),
    },
    {
      type: "lasso",
      icon: TOOLS.lasso.icon,
      fillable: TOOLS.lasso.fillable,
      title: capitalizeString(t("toolBar.lasso")),
    },
  ] as const;

  const displayedOption =
    SELECTION_TOOLS.find(
      (tool) => tool.type === app.state.preferredSelectionTool.type,
    ) || SELECTION_TOOLS[0];

  return (
    <ToolPopover
      app={app}
      options={SELECTION_TOOLS}
      activeTool={activeTool}
      defaultOption={app.state.preferredSelectionTool.type}
      data-testid="toolbar-selection"
      onToolChange={(type: string) => {
        if (type === "selection" || type === "lasso") {
          app.setActiveTool({ type });
          setAppState({
            preferredSelectionTool: { type, initialized: true },
          });
        }
      }}
      displayedOption={displayedOption}
    />
  );
};

/**
 * The freedraw ⇄ draw-shape popover used in compact (tablet) and mobile
 * toolbars. The trigger remembers and displays the most recently used option.
 */
export const FreedrawToolPopover = ({
  app,
  activeTool,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
}) => {
  const DRAWING_TOOLS = [
    {
      type: "freedraw",
      icon: TOOLS.freedraw.icon,
      fillable: TOOLS.freedraw.fillable,
      title: capitalizeString(t("toolBar.freedraw")),
    },
    {
      type: "autoshape",
      icon: TOOLS.autoshape.icon,
      fillable: TOOLS.autoshape.fillable,
      title: capitalizeString(t("toolBar.autoshape")),
    },
  ] as const;

  const [lastDrawingTool, setLastDrawingTool] = useState<
    typeof DRAWING_TOOLS[number]["type"]
  >(activeTool.type === "autoshape" ? "autoshape" : "freedraw");

  useEffect(() => {
    if (activeTool.type === "freedraw" || activeTool.type === "autoshape") {
      setLastDrawingTool(activeTool.type);
    }
  }, [activeTool.type]);

  const displayedOption =
    DRAWING_TOOLS.find((tool) => tool.type === lastDrawingTool) ||
    DRAWING_TOOLS[0];

  return (
    <ToolPopover
      app={app}
      options={DRAWING_TOOLS}
      activeTool={activeTool}
      defaultOption={lastDrawingTool}
      data-testid="toolbar-freedraw"
      onToolChange={(type: string) => {
        if (type === "freedraw" || type === "autoshape") {
          setLastDrawingTool(type);
          app.setActiveTool({ type });
        }
      }}
      displayedOption={displayedOption}
    />
  );
};

// the six engineering/drafting instruments, grouped behind one toolbar icon.
// Static flyout (no "remember last used"): the trigger shows the active
// sub-tool's icon, or the category icon when no engineering tool is active.
const ENGINEERING_TOOLS = [
  { type: "compass", icon: compassIcon, label: "toolBar.compass" },
  { type: "ruler", icon: rulerIcon, label: "toolBar.ruler" },
  { type: "protractor", icon: protractorIcon, label: "toolBar.protractor" },
  { type: "tsquare", icon: tSquareIcon, label: "toolBar.tsquare" },
  { type: "setsquare", icon: setSquareIcon, label: "toolBar.setsquare" },
  {
    type: "anglebisector",
    icon: angleBisectorIcon,
    label: "toolBar.anglebisector",
  },
] as const;

export const EngineeringToolsDropdown = ({
  app,
  activeTool,
  setAppState,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const activeEngineeringTool = ENGINEERING_TOOLS.find(
    (tool) => activeTool.type === tool.type,
  );
  const engineeringToolSelected = activeEngineeringTool != null;

  return (
    <DropdownMenu open={isOpen}>
      <DropdownMenu.Trigger
        className={clsx("App-toolbar__engineering-tools-trigger", {
          "App-toolbar__engineering-tools-trigger--selected":
            engineeringToolSelected,
        })}
        onToggle={() => {
          setIsOpen(!isOpen);
          setAppState({ openMenu: null, openPopup: null });
        }}
        title={t("toolBar.engineeringTools")}
      >
        {activeEngineeringTool
          ? activeEngineeringTool.icon
          : engineeringToolsIcon}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        onClickOutside={() => setIsOpen(false)}
        onSelect={() => setIsOpen(false)}
        className="App-toolbar__extra-tools-dropdown"
      >
        {ENGINEERING_TOOLS.map((tool) => (
          <DropdownMenu.Item
            key={tool.type}
            onSelect={() => app.setActiveTool({ type: tool.type })}
            icon={tool.icon}
            data-testid={`toolbar-${tool.type}`}
            selected={activeTool.type === tool.type}
            disabled={isToolButtonDisabled(app, tool.type)}
          >
            {t(tool.label)}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

// the five 2D shape tools, grouped behind one "shape family" trigger that
// fans them out along an arc instead of a vertical list — this is the one
// tool group whose whole point is "many shapes, one origin," so the reveal
// itself carries that meaning instead of just being another dropdown.
const SHAPE_TOOLS = [
  {
    type: "rectangle",
    icon: TOOLS.rectangle.icon,
    label: "toolBar.rectangle",
  },
  { type: "diamond", icon: TOOLS.diamond.icon, label: "toolBar.diamond" },
  { type: "polygon", icon: TOOLS.polygon.icon, label: "toolBar.polygon" },
  { type: "shape3d", icon: TOOLS.shape3d.icon, label: "toolBar.shape3d" },
  { type: "ellipse", icon: TOOLS.ellipse.icon, label: "toolBar.ellipse" },
] as const;

// fan geometry — 5 chips swept across 110° (35°→145°, measured from the
// positive x-axis) at a 76px radius, opening downward — the toolbar sits at
// the top of the canvas, so an upward fan would push chips off-screen.
const SHAPE_FAN_RADIUS = 76;
const SHAPE_FAN_ANGLES_DEG = [35, 62.5, 90, 117.5, 145];
const SHAPE_FAN_STAGGER_MS = 35;

export const ShapeToolsFan = ({
  app,
  activeTool,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOutsideClick(containerRef, () => setIsOpen(false));

  // dismiss on canvas interaction, same as ToolPopover
  useEffect(() => {
    const unsubscribe = app.onPointerDownEmitter.on(() => setIsOpen(false));
    return () => unsubscribe?.();
  }, [app]);

  const activeShapeTool = SHAPE_TOOLS.find(
    (tool) => activeTool.type === tool.type,
  );

  return (
    <div
      className={clsx("App-toolbar__shape-fan", {
        "App-toolbar__shape-fan--open": isOpen,
      })}
      ref={containerRef}
    >
      <IconButton
        className={clsx("App-toolbar__shape-fan-trigger", {
          "App-toolbar__shape-fan-trigger--selected": activeShapeTool != null,
        })}
        type="toggle"
        icon={activeShapeTool ? activeShapeTool.icon : shapeFamilyIcon}
        checked={isOpen}
        title={capitalizeString(t("toolBar.shapes"))}
        aria-label={capitalizeString(t("toolBar.shapes"))}
        data-testid="toolbar-shapes"
        onSelect={() => setIsOpen((open) => !open)}
      />
      {SHAPE_TOOLS.map((tool, index) => {
        const angle = (SHAPE_FAN_ANGLES_DEG[index] * Math.PI) / 180;
        const sx = Math.cos(angle) * SHAPE_FAN_RADIUS;
        const sy = Math.sin(angle) * SHAPE_FAN_RADIUS;
        return (
          <IconButton
            key={tool.type}
            className={clsx("App-toolbar__shape-fan-chip", {
              fillable: TOOLS[tool.type].fillable,
            })}
            type="toggle"
            icon={tool.icon}
            checked={activeTool.type === tool.type}
            disabled={isToolButtonDisabled(app, tool.type)}
            title={`${capitalizeString(t(tool.label))} — ${getToolShortcut(
              tool.type,
            )}`}
            aria-label={capitalizeString(t(tool.label))}
            data-testid={`toolbar-${tool.type}`}
            style={
              {
                "--sx": `${sx}px`,
                "--sy": `${sy}px`,
                "--d": `${index * SHAPE_FAN_STAGGER_MS}ms`,
              } as React.CSSProperties
            }
            onSelect={() => {
              if (app.state.activeTool.type !== tool.type) {
                trackEvent("toolbar", tool.type, "ui");
                app.setActiveTool({ type: tool.type });
              }
              setIsOpen(false);
            }}
          />
        );
      })}
    </div>
  );
};

// image/video/pdf, grouped behind one "import" trigger — a flat labeled
// list (mirrors EngineeringToolsDropdown), deliberately not a fan: these
// are three unrelated file kinds, not one family of shapes, so a vertical
// list of icon+label reads truer than a radial reveal.
const IMPORT_TOOLS = [
  { type: "image", icon: ImageIcon, label: "toolBar.image" },
  { type: "video", icon: VideoIcon, label: "toolBar.video" },
  { type: "pdf", icon: PdfIcon, label: "toolBar.pdf" },
] as const;

export const ImportToolsDropdown = ({
  app,
  activeTool,
  setAppState,
  UIOptions,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const enabledImportTools = IMPORT_TOOLS.filter(
    (tool) => UIOptions.tools?.[tool.type] !== false,
  );

  if (enabledImportTools.length === 0) {
    return null;
  }

  const activeImportTool = enabledImportTools.find(
    (tool) => activeTool.type === tool.type,
  );
  const importToolSelected = activeImportTool != null;

  return (
    <DropdownMenu open={isOpen}>
      <DropdownMenu.Trigger
        className={clsx("App-toolbar__import-tools-trigger", {
          "App-toolbar__import-tools-trigger--selected": importToolSelected,
        })}
        onToggle={() => {
          setIsOpen(!isOpen);
          setAppState({ openMenu: null, openPopup: null });
        }}
        title={capitalizeString(t("toolBar.import"))}
        data-testid="toolbar-import-tools"
      >
        {activeImportTool ? activeImportTool.icon : importToolsIcon}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        onClickOutside={() => setIsOpen(false)}
        onSelect={() => setIsOpen(false)}
        className="App-toolbar__extra-tools-dropdown"
      >
        {enabledImportTools.map((tool) => (
          <DropdownMenu.Item
            key={tool.type}
            onSelect={() => app.setActiveTool({ type: tool.type })}
            icon={tool.icon}
            data-testid={`toolbar-${tool.type}`}
            selected={activeTool.type === tool.type}
            disabled={isToolButtonDisabled(app, tool.type)}
          >
            {t(tool.label)}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
