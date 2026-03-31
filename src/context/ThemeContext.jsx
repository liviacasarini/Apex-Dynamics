import { createContext, useContext, useState, useEffect } from 'react';
import { DARK_COLORS, LIGHT_COLORS } from '@/constants/colors';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('rt_theme') !== 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', !isDark);
    localStorage.setItem('rt_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleTheme: () => setIsDark(p => !p) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useColors = () => useContext(ThemeContext).colors;
export const useTheme  = () => useContext(ThemeContext);
