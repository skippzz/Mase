import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Files,
  HelpCircle,
  LayoutTemplate,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type {
  Appointment,
  Client,
  StudioState,
  TemplateProfile,
} from "./types";
import { dateKey, defaults, demonstration, weekStart } from "./lib/calendar";
import {
  clearStorage,
  loadStudio,
  removeProfile,
  saveProfile,
  saveStudio,
} from "./lib/storage";
import { defaultProfiles } from "./lib/profiles";
import { Calendar } from "./pages/Calendar";
import { Clients } from "./pages/Clients";
import { Documents } from "./pages/Documents";
import { Templates } from "./pages/Templates";
import { Settings } from "./pages/Settings";
import { AppointmentModal } from "./components/AppointmentModal";
import { CalendarImport } from "./components/CalendarImport";
import { Notice } from "./components/ui";
import { WeeklySchedules } from "./pages/WeeklySchedules";

type Page =
  "weekly" | "calendar" | "clients" | "documents" | "templates" | "settings";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const navigation = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "clients", label: "Clients", icon: Users },
  { id: "documents", label: "Documents", icon: Files },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
] as const;
function currentPage(): Page {
  const hash = location.hash.slice(1);
  return [
    "weekly",
    "calendar",
    "clients",
    "documents",
    "templates",
    "settings",
  ].includes(hash)
    ? (hash as Page)
    : "weekly";
}
export default function App() {
  const [studio, setStudio] = useState<StudioState>(structuredClone(defaults)),
    [profiles, setProfiles] = useState<TemplateProfile[]>([]),
    [loading, setLoading] = useState(true),
    [resourceRevision, setResourceRevision] = useState(0),
    [error, setError] = useState("");
  const studioRef = useRef(studio),
    writeQueue = useRef(Promise.resolve());
  const [page, setPage] = useState<Page>(currentPage),
    [start, setStart] = useState(weekStart(new Date())),
    [appointment, setAppointment] = useState<Appointment>(),
    [importing, setImporting] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false);
  const lastStudioPage = useRef<Page>(
    currentPage() === "weekly" ? "calendar" : currentPage(),
  );
  const [documentOptions, setDocumentOptions] = useState({
    client: "",
    mode: "calendar" as "calendar" | "spreadsheet",
    profile: "weekly-schedule",
    key: 0,
  });
  const [online, setOnline] = useState(navigator.onLine),
    [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      setError(
        "Offline setup did not complete. The app works online; reload online to try caching it again.",
      ),
  });
  useEffect(() => {
    let live = true;
    loadStudio()
      .then(async (result) => {
        if (!live) return;
        studioRef.current = result.state;
        setStudio(result.state);
        setProfiles(result.profiles);
        setLoading(false);
      })
      .catch((e) => {
        if (live) {
          setError(
            `Local storage could not be opened: ${e.message}. Allow browser storage to use this app.`,
          );
          setLoading(false);
        }
      });
    const hash = () => {
      const next = currentPage();
      if (next !== "weekly") lastStudioPage.current = next;
      setPage(next);
      setMobileMenu(false);
    };
    const on = () => setOnline(true),
      off = () => setOnline(false),
      install = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as InstallPrompt);
      };
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      live = false;
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  function navigate(next: Page) {
    if (next !== "weekly") lastStudioPage.current = next;
    location.hash = next;
    setPage(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0 });
  }
  function commit(update: StudioState | ((s: StudioState) => StudioState)) {
    const task = writeQueue.current
      .catch(() => {})
      .then(async () => {
        const next =
          typeof update === "function" ? update(studioRef.current) : update;
        await saveStudio(next);
        studioRef.current = next;
        setStudio(next);
      });
    writeQueue.current = task;
    return task;
  }
  async function storeProfile(p: TemplateProfile) {
    await saveProfile(p);
    setProfiles((prev) =>
      prev.some((old) => old.id === p.id)
        ? prev.map((old) => (old.id === p.id ? p : old))
        : [...prev, p],
    );
  }
  function add(date = dateKey(new Date()), time = "09:00", clientId = "") {
    setAppointment({
      id: crypto.randomUUID(),
      clientId,
      date,
      start: time,
      duration: 60,
      service: "Pilates",
      location: "",
      notes: "",
      status: "confirmed",
    });
  }
  function documents(
    client = "",
    profile = "weekly-schedule",
    mode: "calendar" | "spreadsheet" = "calendar",
  ) {
    setDocumentOptions((o) => ({ client, mode, profile, key: o.key + 1 }));
    navigate("documents");
  }
  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(undefined);
    }
  }
  const displayName = studio.settings.trainerName || "Your private studio";
  const uaMode = page === "weekly";
  return (
    <div className={`app-shell ${uaMode ? "ua-mode" : "studio-mode"}`}>
      {!uaMode && (
        <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
          <a
            className="brand"
            href="#weekly"
            onClick={() => navigate("weekly")}
          >
            <span>
              mase<span className="brand-dot">.</span>
            </span>
            <small>THE PRIVATE STUDIO</small>
          </a>
          <button
            className="icon-button mobile-close"
            aria-label="Close menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
          <div className="workspace-label">WORKSPACE</div>
          <nav>
            {navigation.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => {
                  if (item.id === "documents" && page !== "documents")
                    documents();
                  else navigate(item.id);
                }}
              >
                <item.icon size={19} strokeWidth={1.6} />
                {item.label}
                {page === item.id && <span />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <svg viewBox="0 0 90 90" aria-hidden="true">
              <path d="M44 77c-3-18 3-38 16-64M44 53C20 53 17 40 20 28c18 1 27 12 24 25M48 42c20-6 24-18 20-30-13 5-22 18-20 30" />
            </svg>
            <span>
              A little more flow.
              <br />A little less admin.
            </span>
            <button className="text-button" onClick={() => documents()}>
              Create something lovely
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
            >
              <Settings2 size={18} strokeWidth={1.6} />
              Studio settings
            </button>
            <button className="nav-item" onClick={() => navigate("settings")}>
              <HelpCircle size={18} strokeWidth={1.6} />A little guidance
            </button>
            <div className="studio-identity">
              <span className="avatar">
                {studio.settings.trainerName
                  ? studio.settings.trainerName
                      .split(" ")
                      .slice(0, 2)
                      .map((s) => s[0])
                      .join("")
                  : "m."}
              </span>
              <span>
                <strong>{displayName}</strong>
                <small>Made for movement</small>
              </span>
            </div>
          </div>
        </aside>
      )}
      {!uaMode && mobileMenu && (
        <button
          className="menu-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            {uaMode ? (
              <a
                className="ua-brand"
                href="#weekly"
                onClick={() => navigate("weekly")}
              >
                <strong>URBAN ACTIVE</strong>
                <small>WEEKLY STORIES</small>
              </a>
            ) : (
              <>
                <button
                  className="icon-button mobile-toggle"
                  aria-label="Open navigation"
                  onClick={() => setMobileMenu(true)}
                >
                  <Menu size={21} />
                </button>
                <span>Workspace</span>
                <ChevronRight size={13} />
                <strong>
                  {page === "calendar"
                    ? "Schedule"
                    : page[0].toUpperCase() + page.slice(1)}
                </strong>
              </>
            )}
          </div>
          <div>
            <div
              className="workspace-switch"
              role="group"
              aria-label="Workspace mode"
            >
              <button aria-pressed={uaMode} onClick={() => navigate("weekly")}>
                UA story
              </button>
              <button
                aria-pressed={!uaMode}
                onClick={() => navigate(lastStudioPage.current)}
              >
                Studio tools
              </button>
            </div>
            <span className="connection-status">
              <i className={!online ? "offline" : ""} />
              {!online
                ? "Working offline"
                : offlineReady || navigator.serviceWorker?.controller
                  ? "Offline ready"
                  : "Private & local"}
            </span>
            <span className="topbar-divider" />
            <span className="topbar-date">
              {new Date().toLocaleDateString(studio.settings.locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </header>
        <main>
          {error && (
            <div className="global-notice">
              <Notice error>
                {error}
                <button
                  className="icon-button"
                  aria-label="Dismiss notice"
                  onClick={() => setError("")}
                >
                  <X size={14} />
                </button>
              </Notice>
            </div>
          )}
          {needRefresh && (
            <Notice>
              A studio update is ready. Finish your downloads before updating.{" "}
              <button
                className="text-button"
                onClick={() => updateServiceWorker(true)}
              >
                Update app
              </button>
            </Notice>
          )}
          {!uaMode && studio.settings.demo && (
            <div className="demo-banner">
              <span>
                Sample studio · Fictional clients and sessions for exploring the
                app.
              </span>
              <button
                className="text-button"
                onClick={() => {
                  commit((s) => ({
                    ...s,
                    clients: s.clients.filter(
                      (c) => !c.id.startsWith("sample-"),
                    ),
                    appointments: s.appointments.filter(
                      (a) =>
                        !a.id.startsWith("sample-") &&
                        !a.clientId.startsWith("sample-"),
                    ),
                    settings: { ...s.settings, demo: false },
                  })).catch((e) => setError(e.message));
                }}
              >
                Clear sample data
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-state">
              <span className="serif-mark">m.</span>
              <p>Opening your studio…</p>
            </div>
          ) : (
            <>
              <div className="ua-page mode-content" hidden={!uaMode}>
                <WeeklySchedules resourceRevision={resourceRevision} />
              </div>
              <div className="studio-page mode-content" hidden={uaMode}>
                {page === "calendar" && (
                  <Calendar
                    studio={studio}
                    start={start}
                    setStart={setStart}
                    edit={setAppointment}
                    add={add}
                    share={() => documents()}
                    importExcel={() => setImporting(true)}
                    demo={() => {
                      commit((s) => {
                        const sample = demonstration(start);
                        return {
                          ...s,
                          clients: [...s.clients, ...sample.clients],
                          appointments: [
                            ...s.appointments,
                            ...sample.appointments,
                          ],
                          settings: { ...s.settings, demo: true },
                        };
                      }).catch((e) => setError(e.message));
                    }}
                  />
                )}
                {page === "clients" && (
                  <Clients
                    studio={studio}
                    save={async (c: Client) =>
                      commit((s) => ({
                        ...s,
                        clients: s.clients.some((old) => old.id === c.id)
                          ? s.clients.map((old) => (old.id === c.id ? c : old))
                          : [...s.clients, c],
                      }))
                    }
                    remove={async (id) =>
                      commit((s) => ({
                        ...s,
                        clients: s.clients.filter((c) => c.id !== id),
                        appointments: s.appointments.filter(
                          (a) => a.clientId !== id,
                        ),
                      }))
                    }
                    session={(id) => add(undefined, undefined, id)}
                    share={(id) => documents(id)}
                  />
                )}
                {page === "documents" && (
                  <Documents
                    key={documentOptions.key}
                    studio={studio}
                    profiles={profiles}
                    save={storeProfile}
                    start={start}
                    setStart={setStart}
                    initialClient={documentOptions.client}
                    initialMode={documentOptions.mode}
                    initialProfile={documentOptions.profile}
                  />
                )}
                {page === "templates" && (
                  <Templates
                    studio={studio}
                    profiles={profiles}
                    start={start}
                    save={storeProfile}
                    remove={async (id) => {
                      await removeProfile(id);
                      setProfiles((p) => p.filter((x) => x.id !== id));
                    }}
                    useTemplate={(id) => {
                      const p = profiles.find((p) => p.id === id);
                      documents(
                        "",
                        id,
                        p?.fields.some(
                          (f) =>
                            f.source.kind === "cell" ||
                            f.source.kind === "column" ||
                            f.source.kind === "scheduleBlock",
                        ) || p?.design === "session"
                          ? "spreadsheet"
                          : "calendar",
                      );
                    }}
                  />
                )}
                {page === "settings" && (
                  <Settings
                    studio={studio}
                    profiles={profiles}
                    save={(settings) => commit((s) => ({ ...s, settings }))}
                    restored={(s, p) => {
                      setResourceRevision((revision) => revision + 1);
                      studioRef.current = s;
                      setStudio(s);
                      setProfiles(p);
                    }}
                    reset={() => {
                      setResourceRevision((revision) => revision + 1);
                      const s = structuredClone(defaults);
                      studioRef.current = s;
                      setStudio(s);
                      setProfiles(defaultProfiles());
                    }}
                    install={install}
                    installAvailable={!!installPrompt}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
      {appointment && (
        <AppointmentModal
          initial={appointment}
          studio={studio}
          close={() => setAppointment(undefined)}
          save={async (a, name) =>
            commit((s) => {
              const client = name
                ? {
                    id: crypto.randomUUID(),
                    name,
                    email: "",
                    phone: "",
                    notes: "",
                  }
                : undefined;
              const appt = client ? { ...a, clientId: client.id } : a;
              return {
                ...s,
                clients: client ? [...s.clients, client] : s.clients,
                appointments: s.appointments.some((old) => old.id === a.id)
                  ? s.appointments.map((old) => (old.id === a.id ? appt : old))
                  : [...s.appointments, appt],
              };
            })
          }
          remove={(id) =>
            commit((s) => ({
              ...s,
              appointments: s.appointments.filter((a) => a.id !== id),
            }))
          }
        />
      )}
      {importing && (
        <CalendarImport
          studio={studio}
          save={commit}
          close={() => setImporting(false)}
        />
      )}
    </div>
  );
}
