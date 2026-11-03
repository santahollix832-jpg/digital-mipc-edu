import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export const WALLPAPERS = [
  {
    id: 'indigo-glass',
    name: 'Dark Indigo Glass',
    description: 'Deep indigo glass with aurora accents',
    className: 'wp-indigo-glass',
    preview: 'linear-gradient(135deg,#0f0a2e 0%,#1e1b4b 45%,#312e81 100%)',
  },
  {
    id: 'slate',
    name: 'Minimalist Slate',
    description: 'Calm monochrome slate surface',
    className: 'wp-slate',
    preview: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)',
  },
  {
    id: 'emerald',
    name: 'Musanze Emerald',
    description: 'Volcanic emerald inspired by the hills',
    className: 'wp-emerald',
    preview: 'linear-gradient(135deg,#022c22 0%,#064e3b 45%,#065f46 100%)',
  },
  {
    id: 'gradient',
    name: 'Futuristic Gradient',
    description: 'Vibrant futuristic violet-to-cyan flow',
    className: 'wp-gradient',
    preview: 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 40%,#0ea5e9 100%)',
  },
];

export function getWallpaper(id) {
  return WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
}

const STORAGE_PREFIX = 'mipc:wallpaper:';

function readStoredWallpaper(userId) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId || 'guest'}`) || '';
  } catch {
    return '';
  }
}

function writeStoredWallpaper(userId, id) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId || 'guest'}`, id);
  } catch {
    /* storage unavailable — theme stays for this session only */
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ user, children }) {
  const [wallpaperId, setWallpaperId] = useState(() => readStoredWallpaper(user?.id || user?.user_id));

  const wallpaper = getWallpaper(wallpaperId);

  useEffect(() => {
    if (!user) return;
    setWallpaperId(readStoredWallpaper(user.id || user.user_id));
  }, [user?.id || user?.user_id]);

  useEffect(() => {
    const root = document.body;
    WALLPAPERS.forEach((w) => root.classList.remove(w.className));
    root.classList.add(wallpaper.className);
  }, [wallpaper.className]);

  const value = useMemo(
    () => ({
      wallpaper,
      wallpapers: WALLPAPERS,
      setWallpaper(id) {
        setWallpaperId(id);
        writeStoredWallpaper(user?.id || user?.user_id, id);
      },
    }),
    [wallpaper, user?.id || user?.user_id],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
}
