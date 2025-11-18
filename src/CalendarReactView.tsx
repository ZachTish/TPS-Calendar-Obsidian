import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventResizeArg,
  EventDragStartArg,
  EventDragStopArg,
  EventResizeStartArg,
  EventResizeStopArg,
  EventMountArg,
} from "@fullcalendar/core";
import { BasesEntry, BasesPropertyId, DateValue, Platform, Value } from "obsidian";
import { useApp } from "./hooks";
import {
  calculateSlotHeightFromZoom,
  calculateSlotZoom,
  DEFAULT_CONDENSE_LEVEL,
  DEFAULT_PRIORITY_COLOR_MAP,
  DEFAULT_STATUS_STYLE_MAP,
  formatZoomLabel,
  MAX_CONDENSE_LEVEL,
} from "./utils";

const DEFAULT_SLOT_MIN_TIME = "00:00:00";
const DEFAULT_SLOT_MAX_TIME = "24:00:00";
const DEFAULT_SCROLL_TIME = "08:00:00";
type ViewMode = "3d" | "5d" | "month";

interface CalendarEntry {
  entry: BasesEntry;
  startDate: Date;
  endDate?: Date;
}

interface CalendarReactViewProps {
  entries: CalendarEntry[];
  weekStartDay: number;
  properties: BasesPropertyId[];
  onEntryClick: (entry: BasesEntry, isModEvent: boolean) => void;
  onEntryContextMenu: (evt: React.MouseEvent, entry: BasesEntry) => void;
  onEventDrop?: (
    entry: BasesEntry,
    newStart: Date,
    newEnd?: Date,
  ) => Promise<void>;
  onEventResize?: (
    entry: BasesEntry,
    newStart: Date,
    newEnd?: Date,
  ) => Promise<void>;
  onCreateSelection?: (start: Date, end: Date) => Promise<void>;
  editable: boolean;
  priorityField?: string | null;
  statusField?: string | null;
  priorityColorMap?: Record<string, string>;
  statusStyleMap?: Record<string, string>;
}

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    if ("data" in (value as object)) {
      return normalizeValue((value as { data: unknown }).data);
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeValue(item))
        .filter(Boolean)
        .join(", ");
    }
    if (value instanceof DateValue) {
      return value.date ? value.date.toISOString() : "";
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
};

const tryGetValue = (
  entry: BasesEntry,
  propId: BasesPropertyId,
): Value | null => {
  try {
    return entry.getValue(propId);
  } catch {
    return null;
  }
};

export const CalendarReactView: React.FC<CalendarReactViewProps> = ({
  entries,
  weekStartDay,
  properties,
  onEntryClick,
  onEntryContextMenu,
  onEventDrop,
  onEventResize,
  onCreateSelection,
  editable,
  priorityField,
  statusField,
  priorityColorMap = DEFAULT_PRIORITY_COLOR_MAP,
  statusStyleMap = DEFAULT_STATUS_STYLE_MAP,
}) => {
  const app = useApp();
  const calendarRef = useRef<FullCalendar>(null);
  const sliderValueRef = useRef<HTMLSpanElement | null>(null);
  const [condenseLevel, setCondenseLevel] = useState(DEFAULT_CONDENSE_LEVEL);
  const [viewMode, setViewMode] = useState<ViewMode>("5d");
  const [showFullDay, setShowFullDay] = useState(true);

  const safeWeekStartDay = Number.isFinite(weekStartDay)
    ? Math.max(0, Math.min(6, weekStartDay))
    : 1;
  const targetDayCount =
    viewMode === "3d" ? 3 : viewMode === "5d" ? 5 : 7;
  const viewName = viewMode === "month"
    ? "dayGridMonth"
    : `timeGridRange-${targetDayCount}`;
  const safeInitialDate = entries[0]?.startDate ?? new Date();

  useEffect(() => {
    const display = sliderValueRef.current;
    if (display) {
      display.textContent = formatZoomLabel(condenseLevel);
    }
  }, [condenseLevel]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    const zoom = calculateSlotZoom(condenseLevel);
    const computedSlotHeight = calculateSlotHeightFromZoom(zoom);
    document.documentElement.style.setProperty(
      "--calendar-slot-height",
      `${computedSlotHeight}px`,
    );
    document.documentElement.style.setProperty(
      "--calendar-slot-zoom",
      `${zoom}`,
    );
    if (api?.el) {
      api.el.style.setProperty("--calendar-slot-height", `${computedSlotHeight}px`);
      api.el.style.setProperty("--calendar-slot-zoom", `${zoom}`);
      api.render();
      api.updateSize();
    }
  }, [condenseLevel, showFullDay]);

  const normalizedDayCount = targetDayCount;
  const events = useMemo(
    () =>
      entries.map((calEntry) => {
        const startDate = new Date(calEntry.startDate);
        const endDate = calEntry.endDate
          ? new Date(calEntry.endDate)
          : new Date(startDate.getTime() + 60 * 60 * 1000);
        const isAllDay =
          startDate.getHours() === 0 &&
          startDate.getMinutes() === 0 &&
          endDate.getHours() === 0 &&
          endDate.getMinutes() === 0;

        const prioritySource = priorityField
          ? tryGetValue(calEntry.entry, priorityField)
          : tryGetValue(calEntry.entry, "priority");
        const priorityValue = normalizeValue(prioritySource)
          .trim()
          .toLowerCase();
        const statusSource = statusField
          ? tryGetValue(calEntry.entry, statusField)
          : tryGetValue(calEntry.entry, "status");
        const statusValue = normalizeValue(statusSource)
          .trim()
          .toLowerCase();
        const normalizedPriority = priorityValue || "normal";
        const normalizedStatus = statusValue || "open";
        const priorityColor =
          priorityColorMap[normalizedPriority] ??
          priorityColorMap["normal"] ??
          DEFAULT_PRIORITY_COLOR_MAP.normal;
        const statusStyles = (statusStyleMap[normalizedStatus] ?? "normal")
          .split("|")
          .map((style) => style.trim().toLowerCase())
          .filter(Boolean);

        const classNames = ["bases-calendar-event"];
        if (["high", "medium", "low"].includes(normalizedPriority)) {
          classNames.push(`bases-calendar-event-priority-${normalizedPriority}`);
        }
        if (normalizedStatus) {
          classNames.push(`bases-calendar-event-status-${normalizedStatus}`);
        }
        classNames.push(...statusStyles.map((style) => `bases-calendar-status-${style}`));

        return {
          id: calEntry.entry.file.path,
          title: calEntry.entry.file.basename,
          start: startDate,
          end: endDate,
          allDay: isAllDay,
          classNames,
          extendedProps: {
            entry: calEntry.entry,
            originalEndDate: calEntry.endDate,
            priorityColor,
          },
          display: isAllDay ? "block" : "auto",
          backgroundColor: "transparent",
          borderColor: "transparent",
          textColor: "inherit",
          "data-priority-color": priorityColor,
        };
      }),
    [
      entries,
      priorityColorMap,
      priorityField,
      statusField,
      statusStyleMap,
    ],
  );

  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      clickInfo.jsEvent.preventDefault();
      const entry = clickInfo.event.extendedProps.entry as BasesEntry;
      const isModEvent = clickInfo.jsEvent.ctrlKey || clickInfo.jsEvent.metaKey;
      if (!entry) return;
      if (Platform.isMobile) {
        const syntheticEvent = {
          nativeEvent: clickInfo.jsEvent,
          currentTarget: clickInfo.el,
          target: clickInfo.el,
          preventDefault: () => clickInfo.jsEvent.preventDefault(),
          stopPropagation: () => clickInfo.jsEvent.stopPropagation(),
        } as unknown as React.MouseEvent;
        onEntryContextMenu(syntheticEvent, entry);
        return;
      }
      onEntryClick(entry, isModEvent);
    },
    [onEntryClick, onEntryContextMenu],
  );

  const handleEventMouseEnter = useCallback(
    (mouseEnterInfo: { event: any; el: HTMLElement; jsEvent: MouseEvent }) => {
      const entry = mouseEnterInfo.event.extendedProps.entry as BasesEntry;
      if (app) {
        app.workspace.trigger("hover-link", {
          event: mouseEnterInfo.jsEvent,
          source: "bases",
          hoverParent: app.renderContext,
          targetEl: mouseEnterInfo.el,
          linktext: entry.file.path,
        });
      }

      const contextMenuHandler = (evt: Event) => {
        evt.preventDefault();
        evt.stopPropagation();
        if ("stopImmediatePropagation" in evt) {
          (evt as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        }
        const syntheticEvent = {
          nativeEvent: evt as MouseEvent,
          currentTarget: mouseEnterInfo.el,
          target: evt.target as HTMLElement,
          preventDefault: () => evt.preventDefault(),
          stopPropagation: () => evt.stopPropagation(),
        } as unknown as React.MouseEvent;
        onEntryContextMenu(syntheticEvent, entry);
      };

      mouseEnterInfo.el.addEventListener("contextmenu", contextMenuHandler, {
        once: true,
      });
    },
    [app, onEntryContextMenu],
  );

  const handleDrop = useCallback(
    async (dropInfo: EventDropArg) => {
      if (!onEventDrop) {
        dropInfo.revert();
        return;
      }
      const entry = dropInfo.event.extendedProps.entry as BasesEntry;
      const newStart = dropInfo.event.start;
      const newEnd = dropInfo.event.end;
      if (!newStart) {
        dropInfo.revert();
        return;
      }
      try {
        await onEventDrop(entry, newStart, newEnd ?? newStart);
      } catch (error) {
        console.error(error);
        dropInfo.revert();
      }
    },
    [onEventDrop],
  );

  const handleResize = useCallback(
    async (resizeInfo: EventResizeArg) => {
      if (!onEventResize) {
        resizeInfo.revert();
        return;
      }
      const entry = resizeInfo.event.extendedProps.entry as BasesEntry;
      const newStart = resizeInfo.event.start;
      const newEnd = resizeInfo.event.end;
      if (!newStart || !newEnd) {
        resizeInfo.revert();
        return;
      }
      try {
        await onEventResize(entry, newStart, newEnd);
      } catch (error) {
        console.error(error);
        resizeInfo.revert();
      }
    },
    [onEventResize],
  );

  const formatTime = useCallback((date: Date) => {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  }, []);

  const updateTimeLabels = useCallback(
    (event: any, element: HTMLElement) => {
      const start = event.start;
      const end = event.end;
      const topLabel = element.querySelector(".bases-calendar-time-top") as HTMLElement;
      const bottomLabel = element.querySelector(".bases-calendar-time-bottom") as HTMLElement;
      if (!topLabel || !bottomLabel || !start || !end) return;
      topLabel.textContent = formatTime(start);
      bottomLabel.textContent = formatTime(end);
    },
    [formatTime],
  );

  const setLabelsVisible = useCallback((element: HTMLElement, visible: boolean) => {
    const labels = element.querySelectorAll(
      ".bases-calendar-time-top, .bases-calendar-time-bottom",
    );
    labels.forEach((label) => {
      if (visible) {
        label.classList.add("is-visible");
      } else {
        label.classList.remove("is-visible");
      }
    });
  }, []);

  const handleEventMount = useCallback(
    (arg: EventMountArg) => {
      const element = arg.el;
      const event = arg.event;
      if (!element || event.allDay) return;

      const priorityColor = (event.extendedProps.priorityColor as string | undefined) ?? "";
      if (priorityColor) {
        element.style.setProperty("--priority-color", priorityColor);
      }

      let top = element.querySelector(".bases-calendar-time-top") as HTMLElement;
      let bottom = element.querySelector(".bases-calendar-time-bottom") as HTMLElement;
      if (!top) {
        top = document.createElement("div");
        top.className = "bases-calendar-time-top";
        element.prepend(top);
      }
      if (!bottom) {
        bottom = document.createElement("div");
        bottom.className = "bases-calendar-time-bottom";
        element.append(bottom);
      }
      const observer = new MutationObserver(() => updateTimeLabels(event, element));
      observer.observe(element, { attributes: true, attributeFilter: ["style"] });
      (element as any)._timeObserver = observer;
      updateTimeLabels(event, element);
      setLabelsVisible(element, false);
    },
    [setLabelsVisible, updateTimeLabels],
  );

  const handleDragStart = useCallback(
    (info: EventDragStartArg) => {
      const element = info.el;
      const event = info.event;
      if (event.allDay) return;
      updateTimeLabels(event, element);
      setLabelsVisible(element, true);
    },
    [setLabelsVisible, updateTimeLabels],
  );

  const handleDragStop = useCallback(
    (info: EventDragStopArg) => {
      const element = info.el;
      const observer = (element as any)._timeObserver as MutationObserver | undefined;
      if (observer) observer.disconnect();
      setLabelsVisible(element, false);
    },
    [setLabelsVisible],
  );

  const handleResizeStart = useCallback(
    (info: EventResizeStartArg) => {
      const element = info.el;
      const event = info.event;
      if (event.allDay) return;
      updateTimeLabels(event, element);
      setLabelsVisible(element, true);
    },
    [setLabelsVisible, updateTimeLabels],
  );

  const handleResizeStop = useCallback(
    (info: EventResizeStopArg) => {
      const element = info.el;
      const observer = (element as any)._timeObserver as MutationObserver | undefined;
      if (observer) observer.disconnect();
      setLabelsVisible(element, false);
    },
    [setLabelsVisible],
  );

  const handleCondenseInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = Number(event.currentTarget.value);
    setCondenseLevel(
      Math.min(
        MAX_CONDENSE_LEVEL,
        Math.max(0, Number.isFinite(rawValue) ? rawValue : DEFAULT_CONDENSE_LEVEL),
      ),
    );
  }, []);

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (mode === "month") {
      api.changeView("dayGridMonth");
      return;
    }
    const desired = mode === "3d" ? 3 : 5;
    api.changeView(`timeGridRange-${desired}`);
  }, []);

  const handlePrevClick = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (viewMode === "month") {
      api.prev();
      return;
    }
    api.incrementDate({ days: -targetDayCount });
  }, [targetDayCount, viewMode]);

  const handleNextClick = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (viewMode === "month") {
      api.next();
      return;
    }
    api.incrementDate({ days: targetDayCount });
  }, [targetDayCount, viewMode]);

  const sanitizedProperties = properties ?? [];

  const hasNonEmptyValue = useCallback((value: Value): boolean => {
    if (!value || !value.isTruthy()) return false;
    const str = value.toString();
    return str && str.trim().length > 0;
  }, []);

  const PropertyValue: React.FC<{ value: Value }> = ({ value }) => {
    const elementRef = useCallback(
      (node: HTMLElement | null) => {
        if (!node || !app) return;
        while (node.firstChild) {
          node.removeChild(node.firstChild);
        }

        if (!(value instanceof DateValue)) {
          value.renderTo(node, app.renderContext);
          return;
        }

        if ("date" in value && value.date && value.date instanceof Date) {
          const formatter = new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: value.time ? "2-digit" : undefined,
            minute: value.time ? "2-digit" : undefined,
          });
          node.appendChild(document.createTextNode(formatter.format(value.date)));
        }
      },
      [app, value],
    );

    return <span ref={elementRef} />;
  };

  const renderEventContent = useCallback(
    (eventInfo: EventContentArg) => {
      if (!app) return null;
      const entry = eventInfo.event.extendedProps.entry as BasesEntry;
      const validProperties: { propertyId: BasesPropertyId; value: Value }[] = [];
      for (const prop of sanitizedProperties) {
        const value = tryGetValue(entry, prop);
        if (value && hasNonEmptyValue(value)) {
          validProperties.push({ propertyId: prop, value });
        }
      }

      const titleValue = validProperties.length > 0
        ? validProperties[0].value
        : undefined;
      const remainingProps = validProperties.slice(1);

      return (
        <div className="bases-calendar-event-content">
          <div className="bases-calendar-event-title">
            {titleValue ? <PropertyValue value={titleValue} /> : entry.file.basename}
          </div>
          {remainingProps.length > 0 && (
            <div className="bases-calendar-event-properties">
              {remainingProps.map(({ propertyId: prop, value }) => (
                <div key={`${entry.file.path}-${prop}`} className="bases-calendar-event-property">
                  <span className="bases-calendar-event-property-value">
                    <PropertyValue value={value} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
    [app, sanitizedProperties, hasNonEmptyValue],
  );

  const views = {
    "timeGridRange-3": {
      type: "timeGrid",
      duration: { days: 3 },
      buttonText: "3d",
    },
    "timeGridRange-5": {
      type: "timeGrid",
      duration: { days: 5 },
      buttonText: "5d",
    },
    dayGridMonth: {
      buttonText: "Month",
    },
  };

  return (
    <>
      <div className="bases-calendar-condense-control">
        <span className="bases-calendar-condense-label">Slot zoom</span>
        <input
          className="bases-calendar-condense-range"
          type="range"
          min={0}
          max={MAX_CONDENSE_LEVEL}
          value={condenseLevel}
          onChange={handleCondenseInput}
        />
        <span ref={sliderValueRef} className="bases-calendar-condense-value" />
        <button
          type="button"
          className="bases-calendar-full-day-toggle"
          onClick={() => setShowFullDay((value) => !value)}
        >
          {showFullDay ? "Hide full-day slot" : "Show full-day slot"}
        </button>
      </div>
      <FullCalendar
        key={`calendar-${viewMode}-${Math.round(condenseLevel)}-${showFullDay}-${safeInitialDate.toDateString()}`}
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
        initialView={viewName}
        initialDate={safeInitialDate}
        views={views}
        headerToolbar={{
          left: "view3Day,view5Day,viewMonth",
          center: "title",
          right: "navPrev,todayCentered,navNext",
        }}
        customButtons={{
          view3Day: {
            text: "3d",
            click: () => handleViewChange("3d"),
          },
          view5Day: {
            text: "5d",
            click: () => handleViewChange("5d"),
          },
          viewMonth: {
            text: "Month",
            click: () => handleViewChange("month"),
          },
          navPrev: {
            text: "Prev",
            click: handlePrevClick,
          },
          navNext: {
            text: "Next",
            click: handleNextClick,
          },
          todayCentered: {
            text: "Today",
            click: () => calendarRef.current?.getApi()?.today(),
          },
        }}
        buttonText={{ today: "Today" }}
        selectable={!!onCreateSelection}
        selectMirror={false}
        selectOverlap
        select={(selection) => {
          if (!onCreateSelection) return;
          const start = selection.start ?? new Date();
          const end = selection.end ?? new Date(start.getTime() + 30 * 60000);
          onCreateSelection(start, end);
        }}
        selectLongPressDelay={800}
        longPressDelay={800}
        editable={editable}
        eventDurationEditable={!!onEventResize}
        events={events}
        eventContent={renderEventContent}
        eventClick={handleEventClick}
        eventMouseEnter={handleEventMouseEnter}
        eventDrop={handleDrop}
        eventResize={handleResize}
        eventDidMount={handleEventMount}
        eventDragStart={handleDragStart}
        eventDragStop={handleDragStop}
        eventResizeStart={handleResizeStart}
        eventResizeStop={handleResizeStop}
        height="auto"
        expandRows
        nowIndicator
        dayHeaderFormat={{
          weekday: "short",
          month: viewMode === "month" ? "long" : "short",
          day: "numeric",
        }}
        firstDay={safeWeekStartDay}
        slotMinTime={DEFAULT_SLOT_MIN_TIME}
        slotMaxTime={DEFAULT_SLOT_MAX_TIME}
        scrollTime={DEFAULT_SCROLL_TIME}
        slotDuration="00:30:00"
        snapDuration="00:05:00"
        slotLabelInterval="01:00"
        slotLabelFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
        allDaySlot={showFullDay}
        displayEventTime={false}
        displayEventEnd={false}
      />
    </>
  );
};
