export function getWeatherIcon(code) {
  if (code === null || code === undefined) {
    return { icon: '−', label: '不明' };
  }

  const value = Number(code);
  if (value === 0) return { icon: '☀️', label: '晴' };
  if ([1, 2].includes(value)) return { icon: '🌤️', label: '晴曇' };
  if (value === 3) return { icon: '☁️', label: '曇' };
  if ([45, 48].includes(value)) return { icon: '🌫️', label: '霧' };
  if ([51, 53, 55, 56, 57].includes(value)) return { icon: '🌦️', label: '小雨' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return { icon: '🌧️', label: '雨' };
  if ([71, 73, 75, 77, 85, 86].includes(value)) return { icon: '❄️', label: '雪' };
  if ([95, 96, 99].includes(value)) return { icon: '⛈️', label: '雷' };

  return { icon: '☁️', label: '天気' };
}

export function formatTemperature(value) {
  if (value === null || value === undefined) return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${Math.round(number)}°`;
}

export function formatPrecipitation(value) {
  if (value === null || value === undefined) return '降水 -';
  const number = Number(value);
  if (!Number.isFinite(number)) return '降水 -';
  return `降水 ${Math.round(number)}%`;
}
