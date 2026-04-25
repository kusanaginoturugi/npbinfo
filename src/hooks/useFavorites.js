import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'npbinfo_favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load favorites from localStorage:', e);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = useCallback((teamName) => {
    if (!teamName) return;
    setFavorites((prev) =>
      prev.includes(teamName)
        ? prev.filter((t) => t !== teamName)
        : [...prev, teamName]
    );
  }, []);

  const isFavorite = useCallback((teamName) => {
    return favorites.includes(teamName);
  }, [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}
