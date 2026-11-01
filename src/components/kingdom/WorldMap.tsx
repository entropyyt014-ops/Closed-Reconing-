"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Crown, Flag, Globe2, LocateFixed, Loader2, MapPin, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useKingdom } from "@/lib/kingdom/store";
import { kingdomApi } from "@/lib/kingdom/client";
import type { KingdomMarker } from "@/lib/kingdom/types";
import { formatTerritory } from "@/lib/kingdom/constants";
import type * as LeafletNS from "leaflet";

// ─── Helpers ────────────────────────────────────────────────────────────────

const RIVAL_PALETTE = ["#E9A63B", "#63AD5C", "#E4798A", "#2EA8A2", "#C77DBA"] as const;
const OWN_COLOR = "#8e4fd0";
const OWN_FILL = "#8e4fd0";

/** Molded clay-ball shadow — shared by legend swatches and leaderboard crowns. */
const CLAY_BALL: CSSProperties = {
  boxShadow:
    "inset 0 1px 1px rgb(255 255 255 / 0.55), inset 0 -2px 3px rgba(0,0,0,0.2), 0 2px 4px rgba(74,53,85,0.3)",
};

/**
 * CARTO basemaps require an API key on every tile request.
 * Read from NEXT_PUBLIC_CARTO_KEY (set it in your local .env — never commit it).
 * Without a key the atlas still renders kingdoms, just without basemap tiles.
 */
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY ?? "";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function paletteColor(id: string): string {
  return RIVAL_PALETTE[hashString(id) % RIVAL_PALETTE.length];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/** Ground resolution at a latitude/zoom — used to keep tiny territories visible. */
function metersPerPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
}

type GpsStatus = "locating" | "locked" | "chosen" | "unavailable";

interface ClaimSpot {
  lat: number;
  lng: number;
}

function markersSignature(list: KingdomMarker[]): string {
  return list.map((m) => `${m.id}:${m.coins}:${m.lat.toFixed(6)}:${m.lng.toFixed(6)}`).join("|");
}

// ─── Small HUD building blocks ──────────────────────────────────────────────

function StatChip({
  label,
  children,
  className = "",
  style,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`clay flex min-w-0 flex-col gap-0.5 px-4 py-2.5 ${className}`} style={style}>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
      <span className="min-w-0 truncate text-xs font-semibold text-foreground">{children}</span>
    </div>
  );
}

function MapControlButton({
  label,
  onClick,
  busy = false,
  variant = "soft",
  children,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  variant?: "primary" | "soft";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full ${
        variant === "primary" ? "clay-puck" : "clay-puck-soft"
      }`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

// ─── The living world map ───────────────────────────────────────────────────

export function WorldMap() {
  const user = useKingdom((s) => s.user);
  const setUser = useKingdom((s) => s.setUser);

  // HUD state
  const [markers, setMarkers] = useState<KingdomMarker[] | null>(null);
  const [totalKingdoms, setTotalKingdoms] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [syncedAtMs, setSyncedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // GPS / banner state
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("locating");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [claiming, setClaiming] = useState<ClaimSpot | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  // Leaflet refs (map is created inside useEffect — client only)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const territoryLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const haloLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const markersRef = useRef<KingdomMarker[]>([]);

  // bookkeeping refs
  const gpsStatusRef = useRef<GpsStatus>("locating");
  const prevCoinsRef = useRef<Map<string, number> | null>(null);
  const lastSigRef = useRef("");
  const loadErrorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const trailingLoadRef = useRef(false);
  const autoGpsRef = useRef(false);

  useEffect(() => {
    gpsStatusRef.current = gpsStatus;
  }, [gpsStatus]);

  // ── Territory rendering ───────────────────────────────────────────────────

  /** Dashed "influence halo" — max(true radius, 9px of ground) so tiny kingdoms stay visible. */
  const redrawHalos = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const haloLayer = haloLayerRef.current;
    if (!L || !map || !haloLayer) return;
    haloLayer.clearLayers();
    const zoom = map.getZoom();
    for (const m of markersRef.current) {
      const color = m.isMe ? OWN_COLOR : paletteColor(m.id);
      const haloRadius = Math.max(m.territoryRadiusM, metersPerPixel(m.lat, zoom) * 9);
      L.circle([m.lat, m.lng], {
        radius: haloRadius,
        color: "#4a3555",
        weight: 1,
        opacity: 0.35,
        dashArray: "4 6",
        fillColor: color,
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(haloLayer);
    }
  }, []);

  /** Full redraw of territory circles + crown badges (true circles stay zoom-independent). */
  const renderMarkers = useCallback(
    (list: KingdomMarker[]) => {
      const L = LRef.current;
      const map = mapRef.current;
      const territoryLayer = territoryLayerRef.current;
      if (!L || !map || !territoryLayer) return;

      territoryLayer.clearLayers();

      for (const m of list) {
        const color = m.isMe ? OWN_COLOR : paletteColor(m.id);
        const safeKingdom = escapeHtml(m.kingdomName);
        const safeRuler = escapeHtml(m.name);

        // True territory — the accurate 1 coin = 1 m² zone
        L.circle([m.lat, m.lng], {
          radius: m.territoryRadiusM,
          color,
          weight: m.isMe ? 2 : 1.5,
          opacity: m.isMe ? 0.95 : 0.85,
          fillColor: m.isMe ? OWN_FILL : color,
          fillOpacity: m.isMe ? 0.3 : 0.16,
          interactive: false,
        }).addTo(territoryLayer);

        // Center badge
        const size = m.isMe ? 44 : 30;
        const iconHtml = m.isMe
          ? `<div style="position:relative;width:44px;height:44px;">
              <div style="width:44px;height:44px;border-radius:9999px;background:#8e4fd0;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 2px 2px rgb(255 255 255 / 0.55), inset 0 -4px 7px rgba(0,0,0,0.18), 0 4px 10px rgba(74,53,85,0.35);">
                <span style="font-size:15px;line-height:1;color:#fff9f0;">♛</span>
              </div>
              <div style="position:absolute;top:-25px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#fffaf0;color:#4a3555;font-size:10px;font-weight:600;letter-spacing:0.05em;padding:2px 8px;border-radius:9999px;box-shadow:var(--clay-raise-sm);">${safeKingdom}</div>
            </div>`
          : `<div style="width:30px;height:30px;border-radius:9999px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 2px 2px rgb(255 255 255 / 0.55), inset 0 -4px 7px rgba(0,0,0,0.18), 0 4px 10px rgba(74,53,85,0.35);">
              <span style="font-size:13px;line-height:1;color:#fff9f0;">♛</span>
            </div>`;

        const icon = L.divIcon({
          className: "",
          html: iconHtml,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const metaParts = [m.country, m.grade != null ? `Grade ${m.grade}` : null, m.board].filter(Boolean);
        const popupHtml =
          `<div style="min-width:190px;max-width:250px;">` +
          `<div style="font-weight:700;font-size:14px;color:#4a3555;">${safeKingdom}</div>` +
          `<div style="font-size:11px;color:#8a7290;margin-top:1px;">ruled by ${safeRuler}</div>` +
          `<div style="margin-top:7px;font-size:12px;color:#4a3555;"><span style="color:#a86a12;font-weight:700;">${m.coins.toLocaleString()} coins</span> · ${formatTerritory(m.coins)}</div>` +
          (metaParts.length > 0
            ? `<div style="font-size:10.5px;color:#8a7290;margin-top:3px;">${escapeHtml(metaParts.join(" · "))}</div>`
            : "") +
          (m.isMe ? `<div style="margin-top:6px;font-size:11px;color:#8e4fd0;font-weight:600;">This is your kingdom ✦</div>` : "") +
          (m.isDemo ? `<div style="font-size:10px;color:#8a7290;margin-top:3px;">Demo realm</div>` : "") +
          `</div>`;

        const marker = L.marker([m.lat, m.lng], {
          icon,
          title: m.kingdomName,
          alt: `Kingdom of ${m.kingdomName}`,
          zIndexOffset: m.isMe ? 1000 : 0,
          keyboard: true,
        });
        marker.bindPopup(popupHtml, { closeButton: true, autoPan: true, maxWidth: 260 });
        marker.addTo(territoryLayer);
      }

      redrawHalos();
    },
    [redrawHalos],
  );

  // ── Data: poll the realm every 10s ────────────────────────────────────────

  const loadKingdoms = useCallback(async () => {
    if (inFlightRef.current) {
      trailingLoadRef.current = true; // re-sync right after the in-flight call finishes
      return;
    }
    inFlightRef.current = true;
    try {
      const res = await kingdomApi.kingdoms.get();
      const list = res.markers;

      // growth diff → a single toast per poll cycle (max)
      const prev = prevCoinsRef.current;
      let grew: { marker: KingdomMarker; delta: number } | null = null;
      if (prev) {
        for (const m of list) {
          const before = prev.get(m.id);
          if (before !== undefined && m.coins > before) {
            const delta = m.coins - before;
            if (!grew || delta > grew.delta) grew = { marker: m, delta };
          }
        }
      }
      prevCoinsRef.current = new Map(list.map((m) => [m.id, m.coins]));

      if (grew) {
        if (grew.marker.isMe) {
          toast.success(`✦ +${grew.delta} Kingdom Coins — territory expanded!`);
          const st = useKingdom.getState();
          if (st.user && grew.marker.coins > st.user.coins) st.addCoins(grew.marker.coins - st.user.coins);
        } else {
          toast.info(`"${grew.marker.kingdomName}" expanded to ${formatTerritory(grew.marker.coins)}!`);
        }
      }

      markersRef.current = list;
      const sig = markersSignature(list);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        renderMarkers(list); // identical data → keep layers (and open popups) untouched
      }

      setMarkers(list);
      setTotalKingdoms(res.totalKingdoms);
      setMyRank(res.myRank);
      const parsed = Date.parse(res.syncedAt);
      setSyncedAtMs(Number.isFinite(parsed) ? parsed : Date.now());
      loadErrorRef.current = null;
      setLoadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not sync the realm";
      if (!loadErrorRef.current) toast.error(msg); // only toast the first failure of a streak
      loadErrorRef.current = msg;
      setLoadError(msg);
    } finally {
      inFlightRef.current = false;
      if (trailingLoadRef.current) {
        trailingLoadRef.current = false;
        void loadKingdoms();
      }
    }
  }, [renderMarkers]);

  // ── Fly helpers ───────────────────────────────────────────────────────────

  const flyToOwn = useCallback((zoom: number) => {
    const map = mapRef.current;
    const me = markersRef.current.find((m) => m.isMe);
    if (!map || !me) return;
    map.flyTo([me.lat, me.lng], zoom, { duration: 1.8 });
  }, []);

  const locateOwn = useCallback(() => {
    const map = mapRef.current;
    const me = markersRef.current.find((m) => m.isMe);
    if (!me) {
      toast.info("Plant your banner first — tap the map or use your GPS");
      return;
    }
    map?.flyTo([me.lat, me.lng], 16, { duration: 1.8 });
  }, []);

  const worldView = useCallback(() => {
    mapRef.current?.flyTo([20, 10], 2, { duration: 1.6 });
  }, []);

  // ── GPS: live lock, or graceful map-tap fallback ──────────────────────────

  const attemptGps = useCallback(
    (manual: boolean) => {
      if (!manual) {
        if (autoGpsRef.current) return; // StrictMode double-mount guard
        autoGpsRef.current = true;
      }
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setGpsStatus("unavailable");
        if (manual) toast.error("GPS is not available on this device");
        return;
      }
      if (manual) setGpsBusy(true);
      setGpsStatus((s) => (s === "locked" ? s : "locating"));

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await kingdomApi.kingdoms.setLocation(pos.coords.latitude, pos.coords.longitude, "Live GPS");
            setUser(res.user);
            setGpsStatus("locked");
            setGpsBusy(false);
            toast.success("Live GPS locked — your banner stands true ✦");
            await loadKingdoms();
            flyToOwn(15);
          } catch (err) {
            setGpsBusy(false);
            setGpsStatus("unavailable"); // fall back to tap-to-claim
            toast.error(err instanceof Error ? err.message : "Could not set your kingdom's location");
          }
        },
        () => {
          setGpsBusy(false);
          if (gpsStatusRef.current !== "locked") setGpsStatus("unavailable");
          if (manual) toast.error("GPS denied or unavailable — tap the map to plant your banner instead");
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    },
    [setUser, loadKingdoms, flyToOwn],
  );

  const confirmClaim = useCallback(async () => {
    if (!claiming || claimBusy) return;
    setClaimBusy(true);
    try {
      const res = await kingdomApi.kingdoms.setLocation(claiming.lat, claiming.lng, "Chosen on map");
      setUser(res.user);
      setGpsStatus("chosen");
      setClaiming(null);
      toast.success("Your banner rises — the realm will remember it ✦");
      await loadKingdoms();
      flyToOwn(16);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not plant your banner");
    } finally {
      setClaimBusy(false);
    }
  }, [claiming, claimBusy, setUser, loadKingdoms, flyToOwn]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // 1) Map lifecycle — create once, client-only, StrictMode-safe
  useEffect(() => {
    let cancelled = false;
    let createdMap: LeafletNS.Map | null = null;
    let sizeTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const leafletModule = (await import("leaflet")) as unknown as {
          default?: typeof LeafletNS;
        } & typeof LeafletNS;
        const L = leafletModule.default ?? leafletModule;
        // leaflet's stylesheet ships without type declarations — the bundler inlines it
        // @ts-expect-error TS2307: cannot find module 'leaflet/dist/leaflet.css'
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) return; // already created

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
          minZoom: 2,
          maxZoom: 19,
          worldCopyJump: true,
        }).setView([20, 10], 2);

        const tileUrl = CARTO_KEY
          ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
          : `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`;
        L.tileLayer(tileUrl, {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
          },
        ).addTo(map);

        const territoryLayer = L.layerGroup().addTo(map);
        const haloLayer = L.layerGroup().addTo(map);

        createdMap = map;
        LRef.current = L;
        mapRef.current = map;
        territoryLayerRef.current = territoryLayer;
        haloLayerRef.current = haloLayer;

        // tiny kingdoms need their halos recomputed as zoom changes
        map.on("zoomend", () => redrawHalos());

        // no GPS lock → any tap on open ground plants a banner (desktop-testable)
        map.on("click", (e: LeafletNS.LeafletMouseEvent) => {
          if (gpsStatusRef.current === "locked") return;
          setClaiming({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        map.invalidateSize();
        requestAnimationFrame(() => {
          if (!cancelled && mapRef.current === map) map.invalidateSize();
        });
        sizeTimer = setTimeout(() => {
          if (!cancelled && mapRef.current === map) map.invalidateSize();
        }, 400);

        // data may have arrived while leaflet was loading — draw it now
        renderMarkers(markersRef.current);
        setMapReady(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The atlas could not be unrolled");
      }
    })();

    return () => {
      cancelled = true;
      if (sizeTimer) clearTimeout(sizeTimer);
      if (createdMap) createdMap.remove();
      if (mapRef.current === createdMap) {
        mapRef.current = null;
        LRef.current = null;
        territoryLayerRef.current = null;
        haloLayerRef.current = null;
      }
      setMapReady(false);
    };
  }, [redrawHalos, renderMarkers]);

  // 2) Attempt live GPS once on mount (retryable from the control cluster)
  useEffect(() => {
    attemptGps(false);
  }, [attemptGps]);

  // 3) Poll the realm every 10s
  useEffect(() => {
    void loadKingdoms();
    const poll = setInterval(() => {
      void loadKingdoms();
    }, 10_000);
    return () => clearInterval(poll);
  }, [loadKingdoms]);

  // 4) "synced Xs ago" heartbeat
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const ownMarker = useMemo(() => markers?.find((m) => m.isMe) ?? null, [markers]);
  const leaderboard = useMemo(
    () => (markers ? [...markers].sort((a, b) => b.coins - a.coins).slice(0, 8) : []),
    [markers],
  );
  const coins = ownMarker ? ownMarker.coins : (user?.coins ?? 0);
  const syncAgoSec = syncedAtMs !== null ? Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000)) : null;
  const needsBanner = gpsStatus === "unavailable" && !ownMarker && user?.lat == null;

  if (!user) {
    return <div className="shimmer h-[68vh] min-h-[420px] w-full rounded-3xl" aria-hidden />;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      className="flex flex-col gap-4"
      aria-label="World map of kingdoms"
    >
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">The Atlas of Realms</p>
        <h2 className="font-display text-lg font-bold text-foreground">
          World <span className="lavender-text">Map</span>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every ruler&apos;s territory on one living map · 1 coin = 1 m²
        </p>
      </div>

      {/* Stats row */}
      <div className={`grid gap-2 ${loadError ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        <StatChip label="My Kingdom">
          <span className="truncate font-display font-bold">{user.kingdomName}</span>
        </StatChip>
        <StatChip
          label="Treasury"
          style={{ background: "linear-gradient(180deg,#fff3d9,#faeccf)", boxShadow: "var(--clay-raise)" }}
        >
          <span className="gold-text font-bold tabular-nums">{coins.toLocaleString()} coins</span>
          <span className="text-[10px] text-[#a86a12]/70">· {formatTerritory(coins)} of realm</span>
        </StatChip>
        <StatChip label="World Rank">
          <span>
            <span className="font-display font-bold">#{myRank ?? "—"}</span>{" "}
            <span className="font-normal text-muted-foreground">of {totalKingdoms}</span>
          </span>
        </StatChip>
        {loadError && (
          <button
            type="button"
            onClick={() => {
              void loadKingdoms();
            }}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry sync
          </button>
        )}
      </div>

      {/* GPS fallback banner */}
      {needsBanner && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          className="clay flex items-start gap-3 px-4 py-3"
          role="status"
        >
          <div className="clay-well flex h-9 w-9 shrink-0 items-center justify-center">
            <MapPin className="h-4 w-4 text-[#a86a12]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              GPS unavailable — tap anywhere on the map to plant your banner.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your kingdom exists; only its place on the world awaits. Tap, confirm, and your territory becomes visible to every ruler.
            </p>
          </div>
          <button
            type="button"
            onClick={() => attemptGps(true)}
            disabled={gpsBusy}
            className="glow-btn flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
          >
            {gpsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
            Use my GPS
          </button>
        </motion.div>
      )}

      {/* Map */}
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative w-full"
      >
        <div
          ref={containerRef}
          role="region"
          aria-label="Interactive world map showing every scholar's kingdom territory"
          className="isolate h-[68vh] min-h-[420px] w-full overflow-hidden rounded-[2rem]"
          style={{ boxShadow: "var(--clay-raise)", border: "none", background: "#e7dcc3" }}
        />

        {/* the atlas rests in a pressed clay bowl */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[450] rounded-[2rem]"
          style={{
            boxShadow:
              "inset 0 18px 36px -14px rgba(74,53,85,0.4), inset 0 -18px 36px -14px rgba(74,53,85,0.3), inset 0 0 50px rgba(236,225,205,0.3)",
          }}
        />

        {/* shimmer while the atlas unrolls */}
        {!mapReady && (
          <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[2rem]">
            <div className="shimmer absolute inset-0" />
            <Globe2 className="relative h-6 w-6 animate-pulse text-lavender" />
            <p className="relative text-xs text-muted-foreground">Unrolling the ancient maps…</p>
          </div>
        )}

        {/* live status chips — top right */}
        {mapReady && (
          <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-1.5">
            <div className="clay-chip flex items-center gap-2 px-3 py-1.5">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#63ad5c] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#63ad5c]" />
              </span>
              <span className="text-[9px] font-bold tracking-widest text-foreground">LIVE</span>
              <span className="text-[10px] text-muted-foreground">
                {markers === null
                  ? "syncing the realm…"
                  : `${totalKingdoms} ${totalKingdoms === 1 ? "kingdom" : "kingdoms"} · synced ${syncAgoSec ?? 0}s ago`}
              </span>
            </div>
            {gpsStatus === "locked" && (
              <div className="clay-chip flex items-center gap-1.5 px-3 py-1">
                <LocateFixed className="h-3 w-3 text-[#63ad5c]" />
                <span className="text-[10px] font-semibold text-[#4f8a4a]">Live GPS locked</span>
              </div>
            )}
            {gpsStatus === "chosen" && (
              <div
                className="flex items-center gap-1.5 rounded-full bg-[#eda93f] px-3 py-1"
                style={{ boxShadow: "var(--clay-gold)" }}
              >
                <Flag className="h-3 w-3 text-[#5c3708]" />
                <span className="text-[10px] font-semibold text-[#5c3708]">Banner planted</span>
              </div>
            )}
            {gpsStatus === "locating" && (
              <div className="clay-chip flex items-center gap-1.5 px-3 py-1">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Seeking GPS…</span>
              </div>
            )}
          </div>
        )}

        {/* control cluster — bottom right */}
        {mapReady && (
          <div className="absolute bottom-9 right-3 z-[500] flex flex-col gap-2">
            <MapControlButton label="Use my GPS" onClick={() => attemptGps(true)} busy={gpsBusy} variant="primary">
              <LocateFixed className="h-5 w-5" />
            </MapControlButton>
            <MapControlButton label="Locate my kingdom" onClick={locateOwn}>
              <Crown className="h-5 w-5" />
            </MapControlButton>
            <MapControlButton label="World view" onClick={worldView}>
              <Globe2 className="h-5 w-5" />
            </MapControlButton>
          </div>
        )}

        {/* legend — bottom left */}
        {mapReady && (
          <div className="pointer-events-none absolute bottom-9 left-3 z-[500]">
            <div className="clay max-w-[168px] px-3.5 py-3 sm:max-w-[190px]">
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">Legend</p>
              <ul className="flex flex-col gap-1.5 text-[10px] leading-snug text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#8e4fd0]" style={CLAY_BALL} aria-hidden />
                  Your kingdom
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1" aria-hidden>
                    <span className="h-2 w-2 rounded-full bg-[#E9A63B]" style={CLAY_BALL} />
                    <span className="h-2 w-2 rounded-full bg-[#63AD5C]" style={CLAY_BALL} />
                    <span className="h-2 w-2 rounded-full bg-[#E4798A]" style={CLAY_BALL} />
                  </span>
                  Rival kingdoms
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full border border-primary/70 bg-primary/25" aria-hidden />
                  Solid — true territory · 1 coin = 1 m²
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full border border-dashed border-muted-foreground/50" aria-hidden />
                  Dashed — influence halo (min visible)
                </li>
              </ul>
            </div>
          </div>
        )}
      </motion.div>

      {/* Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">The Realm&apos;s Finest</p>
            <h3 className="font-display text-base font-bold text-foreground">Rulers of this Realm</h3>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
            <Trophy className="h-3 w-3 text-[#a86a12]" />
            top 8 by coins
          </span>
        </div>

        {markers === null && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-14 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {markers !== null && markers.length === 0 && (
          <div className="clay flex items-center gap-4 p-4">
            <div className="clay-well flex h-16 w-16 shrink-0 items-center justify-center">
              <Image
                src="/kingdom/dragon-mascot-clay.png"
                alt="Baby dragon mascot"
                width={64}
                height={64}
                className="h-16 w-16 object-contain animate-float-slow"
                onError={(e) => {
                  e.currentTarget.style.opacity = "0";
                }}
              />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-foreground">No kingdoms have risen yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Be the first ruler — plant your banner and claim the very first square metre of the realm.
              </p>
            </div>
          </div>
        )}

        {markers !== null && markers.length > 0 && (
          <ol className="kingdom-scroll flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {leaderboard.map((m, i) => {
              const color = m.isMe ? OWN_COLOR : paletteColor(m.id);
              return (
                <li
                  key={m.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${
                    m.isMe ? "rounded-[1.25rem] bg-primary/10 shadow-[var(--clay-raise-sm)]" : "clay-inset"
                  }`}
                >
                  <span
                    className={`w-7 shrink-0 text-center font-display text-sm font-bold ${
                      i === 0 ? "gold-text" : m.isMe ? "text-lavender" : "text-muted-foreground"
                    }`}
                  >
                    #{i + 1}
                  </span>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px]"
                    style={{ background: color, color: "#fff9f0", ...CLAY_BALL }}
                    aria-hidden
                  >
                    ♛
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                      <span className="truncate">{m.kingdomName}</span>
                      {m.isMe && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                          you
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">ruled by {m.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="gold-text text-sm font-bold tabular-nums">{m.coins.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{formatTerritory(m.coins)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </motion.div>

      {/* Claim-spot confirm dialog */}
      <Dialog
        open={claiming !== null}
        onOpenChange={(open) => {
          if (!open && !claimBusy) setClaiming(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">
              Claim this spot as your kingdom&apos;s heart?
            </DialogTitle>
            <DialogDescription>
              Your banner will rise at {claiming ? `${claiming.lat.toFixed(4)}°, ${claiming.lng.toFixed(4)}°` : "the chosen point"} —
              and your {formatTerritory(coins)} of territory will bloom around it, visible to every ruler of the realm.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              className="ghost-btn rounded-full px-5 py-2.5 text-sm font-medium"
              onClick={() => setClaiming(null)}
              disabled={claimBusy}
            >
              Not here
            </button>
            <button
              type="button"
              className="glow-btn flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
              onClick={() => {
                void confirmClaim();
              }}
              disabled={claimBusy}
            >
              {claimBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Plant my banner
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.section>
  );
}
