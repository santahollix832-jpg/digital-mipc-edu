import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Wallpaper registry.
 *  type: 'gradient' — CSS surfaces rendered by styles.css classes.
 *  type: 'photo'    — high-resolution campus/tech imagery rendered as a fixed cover photo.
 * `className` is the styles.css class added to <body> for this wallpaper.
 * `preview` is a CSS background for the compact selector swatch, `image` is the full-res photo.
 */
export const WALLPAPERS = [
  {
    type: 'gradient',
    id: 'indigo-glass',
    name: 'Dark Indigo Glass',
    description: 'Deep indigo glass with aurora accents',
    className: 'wp-indigo-glass',
    preview: 'linear-gradient(135deg,#0f0a2e 0%,#1e1b4b 45%,#312e81 100%)',
  },
  {
    type: 'gradient',
    id: 'slate',
    name: 'Minimalist Slate',
    description: 'Calm monochrome slate surface',
    className: 'wp-slate',
    preview: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)',
  },
  {
    type: 'gradient',
    id: 'emerald',
    name: 'Musanze Emerald',
    description: 'Volcanic emerald inspired by the hills',
    className: 'wp-emerald',
    preview: 'linear-gradient(135deg,#022c22 0%,#064e3b 45%,#065f46 100%)',
  },
  {
    type: 'gradient',
    id: 'gradient',
    name: 'Futuristic Gradient',
    description: 'Vibrant futuristic violet-to-cyan flow',
    className: 'wp-gradient',
    preview: 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 40%,#0ea5e9 100%)',
  },
  {
    type: 'photo',
    id: 'campus-hills',
    name: 'Campus Hills',
    description: 'Volcanic hills campus backdrop in emerald',
    className: 'wp-photo-campus-hills',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2400&auto=format&fit=crop',
    preview: 'linear-gradient(135deg,#0f2e26 0%,#134e4a 55%,#0f766e 100%)',
  },
  {
    type: 'photo',
    id: 'campus-quad',
    name: 'Campus Quad',
    description: 'Sunlit polytechnic quad with modern architecture',
    className: 'wp-photo-campus-quad',
    image: 'https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=2400&auto=format&fit=crop',
    preview: 'linear-gradient(135deg,#1e293b 0%,#334155 55%,#475569 100%)',
  },
  {
    type: 'photo',
    id: 'tech-aurora',
    name: 'Tech Aurora',
    description: 'Futuristic aurora relay for tech labs',
    className: 'wp-photo-tech-aurora',
    image: 'https://images.unsplash.com/photo-1480694313141-fce5e697ee25?q=80&w=2400&auto=format&fit=crop',
    preview: 'linear-gradient(135deg,#111827 0%,#312e81 55%,#0ea5e9 100%)',
  },
  {
    type: 'photo',
    id: 'library-quiet',
    name: 'Library Quiet',
    description: 'Quiet study relay with warm lamplight',
    className: 'wp-photo-library-quiet',
    image: 'https://images.unsplash.com/photo-1521587760476-6c12c4262188?q=80&w=2400&auto=format&fit=crop',
    preview: 'linear-gradient(135deg,#292524 0%,#44403c 55%,#78716c 100%)',
  },
];

export const CUSTOM_STORAGE_PREFIX = 'mipc:custom-wallpaper:';

export function readStoredCustomWallpaper(userId) {
  try {
    return localStorage.getItem(`${CUSTOM_STORAGE_PREFIX}${userId || 'guest'}`) || '';
  } catch {
    return '';
  }
}

export function writeStoredCustomWallpaper(userId, imageUrl) {
  try {
    if (imageUrl) localStorage.setItem(`${CUSTOM_STORAGE_PREFIX}${userId || 'guest'}`, imageUrl);
    else localStorage.removeItem(`${CUSTOM_STORAGE_PREFIX}${userId || 'guest'}`);
  } catch {
    /* storage unavailable — custom wallpaper stays for this session only */
  }
}

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

const CUSTOM_WALLPAPER_CLASS = 'wp-photo-custom';

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
    root.classList.remove(CUSTOM_WALLPAPER_CLASS);
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
