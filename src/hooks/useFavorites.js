import { useState, useEffect, useCallback } from 'react';
import { normalizeTeamName } from '../data/teams';

const STORAGE_KEY = 'npbinfo_favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.from(new Set(parsed.map(normalizeTeamName)));
    } catch (e) {
      console.error('Failed to load favorites from localStorage:', e);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = useCallback((teamName) => {
    const normalizedName = normalizeTeamName(teamName);
    if (!normalizedName) return;
    setFavorites((prev) =>
      prev.includes(normalizedName)
        ? prev.filter((t) => t !== normalizedName)
        : [...prev, normalizedName]
    );
  }, []);

  const isFavorite = useCallback((teamName) => {
    return favorites.includes(normalizeTeamName(teamName));
  }, [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}
