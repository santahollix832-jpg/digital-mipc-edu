import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Plus, Trash2, Save, Search, Locate, Bus as BusIcon, Play, Pause } from 'lucide-react';

// Fix default marker icon paths bundled by Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const busIcon = L.divIcon({
  className: '',
  html: `<div style="background:#4f46e5;color:#fff;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(79,70,229,.5);border:2px solid #fff;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-4C20.1 6.2 18.6 5 17 5H4a2 2 0 0 0-2 2v10h3"/></svg>
  </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const DEFAULT_CENTER = [-1.9441, 30.0619]; // Kigali

// Interpolate a point at fraction t [0..1] along a polyline
function pointAlongLine(points, t) {
  if (!points.length) return null;
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];
  const total = points.slice(1).reduce(
    (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0
  );
  let target = total * t;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (target <= seg) {
      const f = seg ? target / seg : 0;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
      ];
    }
    target -= seg;
  }
  return points[points.length - 1];
}

const FitRoute = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (valid.length === 1) map.setView(valid[0], 14);
    else if (valid.length > 1) map.fitBounds(L.latLngBounds(valid), { padding: [40, 40] });
  }, [points, map]);
  return null;
};

const RouteMapModal = ({ bus, onClose, onSaveRoute }) => {
  const parseExisting = () => {
    try {
      if (bus?.route_points) {
        const parsed = typeof bus.route_points === 'string' ? JSON.parse(bus.route_points) : bus.route_points;
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch { /* ignore */ }
    return [
      { name: 'Origin', lat: -1.9441, lng: 30.0619 },
      { name: 'Destination', lat: -1.9536, lng: 30.1105 },
    ];
  };

  const [stops, setStops] = useState(parseExisting);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);

  // Simulated live progress along the route
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setProgress((p) => (p >= 1 ? 0 : p + 0.004));
    }, 60);
    return () => clearInterval(timerRef.current);
  }, [playing]);

  const linePoints = useMemo(
    () => stops
      .map((s) => [parseFloat(s.lat), parseFloat(s.lng)])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])),
    [stops]
  );

  const busPos = useMemo(
    () => (linePoints.length ? pointAlongLine(linePoints, progress) : null),
    [linePoints, progress]
  );

  const updateStop = (i, field, value) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));

  const addStop = () =>
    setStops((prev) => [
      ...prev.slice(0, -1),
      { name: `Stop ${prev.length - 1 + 1}`, lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
      prev[prev.length - 1],
    ]);

  const removeStop = (i) => setStops((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveRoute(bus.id, JSON.stringify(stops));
    } finally {
      setSaving(false);
    }
  };

  const geocodeSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (data?.[0]) {
        const { lat, lon, display_name } = data[0];
        setStops((prev) => [
          ...prev.slice(0, -1),
          { name: display_name.split(',')[0], lat: parseFloat(lat), lng: parseFloat(lon) },
          prev[prev.length - 1],
        ]);
      } else {
        alert('Location not found. Try a different search term.');
      }
    } catch {
      alert('Location search failed. Check your connection.');
    } finally {
      setSearching(false);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return alert('Geolocation is not supported.');
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setStops((prev) => [
          ...prev.slice(0, -1),
          { name: 'Current Location', lat: pos.coords.latitude, lng: pos.coords.longitude },
          prev[prev.length - 1],
        ]),
      () => alert('Unable to get your location.')
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 md:p-6">
      <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:flex-row">
        {/* Sidebar — route editor */}
        <div className="flex w-full shrink-0 flex-col border-b border-slate-200 md:w-80 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Route Designer</h3>
              <p className="text-xs font-medium text-indigo-600">{bus?.bus_number} — {bus?.route_name}</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          {/* Search + locate */}
          <div className="flex gap-2 border-b border-slate-100 px-5 py-3">
            <form onSubmit={geocodeSearch} className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search a place..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </form>
            <button onClick={locateMe} title="Use my location" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600">
              <Locate size={15} />
            </button>
          </div>

          {/* Stop list */}
          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
            {stops.map((stop, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${i === 0 ? 'bg-emerald-100 text-emerald-700'
                      : i === stops.length - 1 ? 'bg-rose-100 text-rose-700'
                        : 'bg-indigo-100 text-indigo-700'}`}>
                    {i === 0 ? 'Origin' : i === stops.length - 1 ? 'Destination' : `Stop ${i}`}
                  </span>
                  {i !== 0 && i !== stops.length - 1 && (
                    <button onClick={() => removeStop(i)} className="p-1 text-slate-400 hover:text-rose-600">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <input
                  value={stop.name}
                  onChange={(e) => updateStop(i, 'name', e.target.value)}
                  placeholder="Stop name"
                  className="mb-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                />
                <div className="flex gap-1.5">
                  <input type="number" step="any" value={stop.lat}
                    onChange={(e) => updateStop(i, 'lat', e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Lat" />
                  <input type="number" step="any" value={stop.lng}
                    onChange={(e) => updateStop(i, 'lng', e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Lng" />
                </div>
              </div>
            ))}
            <button onClick={addStop}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-300 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
              <Plus size={14} /> Add intermediate stop
            </button>
          </div>

          {/* Simulation controls + save */}
          <div className="space-y-2 border-t border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setPlaying((p) => !p)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                {playing ? <Pause size={13} /> : <Play size={13} />}
                {playing ? 'Pause simulation' : 'Play simulation'}
              </button>
              <span className="rounded-lg bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-700">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Save size={13} /> {saving ? 'Saving...' : 'Save Route'}
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="relative min-h-[300px] flex-1">
          <MapContainer center={DEFAULT_CENTER} zoom={13} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitRoute points={linePoints} />
            {linePoints.length > 1 && (
              <Polyline positions={linePoints} pathOptions={{ color: '#4f46e5', weight: 4, opacity: 0.8 }} />
            )}
            {linePoints.map((p, i) => (
              <CircleMarker key={i} center={p} radius={7}
                pathOptions={{
                  color: '#fff', weight: 2,
                  fillColor: i === 0 ? '#10b981' : i === linePoints.length - 1 ? '#f43f5e' : '#6366f1',
                  fillOpacity: 1,
                }}>
                <Tooltip direction="top" offset={[0, -8]}>{stops[i]?.name}</Tooltip>
              </CircleMarker>
            ))}
            {busPos && <Marker position={busPos} icon={busIcon}>
              <Tooltip permanent direction="top" offset={[0, -18]} className="font-semibold">
                {bus?.bus_number} · {Math.round(progress * 100)}%
              </Tooltip>
            </Marker>}
          </MapContainer>

          {/* Floating live badge */}
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <BusIcon size={16} className="text-indigo-600" />
            <div className="text-xs">
              <p className="font-bold text-slate-900">Live Route Tracking</p>
              <p className="text-slate-500">{linePoints.length} points · simulated progress</p>
            </div>
            <span className="ml-2 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteMapModal;
