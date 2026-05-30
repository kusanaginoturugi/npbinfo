import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getContrastColor, getTeamInfo } from '../data/teams';
import { STADIUMS } from '../data/stadiums';
import { formatPrecipitation, formatTemperature, getWeatherIcon } from '../utils/weatherIcon';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatWeatherDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

function fieldSizeLabel(stadium) {
  if (stadium.leftField === stadium.rightField) {
    return `両翼${stadium.leftField}m / 中堅${stadium.centerField}m`;
  }
  return `左翼${stadium.leftField}m / 右翼${stadium.rightField}m / 中堅${stadium.centerField}m`;
}

function createMarkerIcon(stadium, selected) {
  const team = getTeamInfo(stadium.team);
  const bg = team?.colors?.[0] ?? '#1a3a5c';
  const color = getContrastColor(bg);
  const code = team?.code ?? stadium.team.slice(0, 2);

  return L.divIcon({
    className: `stadium-marker${selected ? ' selected' : ''}`,
    html: `<span style="background:${bg};color:${color};">${code}</span>`,
    iconSize: selected ? [42, 42] : [34, 34],
    iconAnchor: selected ? [21, 21] : [17, 17],
  });
}

function TeamBadge({ stadium }) {
  const team = getTeamInfo(stadium.team);
  const bg = team?.colors?.[0] ?? '#1a3a5c';

  return (
    <span
      className="stadium-team-badge"
      style={{
        background: bg,
        color: getContrastColor(bg),
      }}
    >
      {team?.code ?? stadium.team.slice(0, 2)}
    </span>
  );
}

function StadiumListItem({ stadium, selected, onSelect }) {
  const team = getTeamInfo(stadium.team);

  return (
    <button
      className={`stadium-list-item ${selected ? 'active' : ''}`}
      onClick={() => onSelect(stadium.id)}
      type="button"
    >
      <TeamBadge stadium={stadium} />
      <span className="stadium-list-text">
        <span className="stadium-list-name">{stadium.name}</span>
        <span className="stadium-list-team">{team?.official ?? stadium.team}</span>
      </span>
    </button>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="stadium-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function WeatherBlock({ stadium }) {
  const [weather, setWeather] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const today = new Date();
    const dates = [
      formatDateValue(today),
      formatDateValue(new Date(today.getTime() + ONE_DAY_MS)),
    ];
    let cancelled = false;

    setLoading(true);
    setError(null);
    Promise.all(dates.map(date => (
      fetch(`/api/weather?lat=${stadium.lat}&lng=${stadium.lng}&date=${date}`)
        .then(r => r.json())
        .then(json => {
          if (json.error) throw new Error(json.error);
          return json;
        })
    )))
      .then(data => {
        if (!cancelled) setWeather(data);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stadium]);

  return (
    <section className="weather-block" aria-label={`${stadium.name}の天気`}>
      <h4>天気予報</h4>
      {loading && <div className="weather-status">読み込み中...</div>}
      {error && <div className="weather-status">取得できませんでした</div>}
      {!loading && !error && (
        <div className="weather-days">
          {weather.map((day) => {
            const weatherIcon = getWeatherIcon(day.weatherCode);
            return (
              <div key={day.date} className="weather-day">
                <span className="weather-date">{formatWeatherDate(day.date)}</span>
                <span className="weather-main">
                  <span className="weather-icon" aria-hidden="true">{weatherIcon.icon}</span>
                  <span>{weatherIcon.label}</span>
                </span>
                <span className="weather-temp">
                  {formatTemperature(day.tempMax)} / {formatTemperature(day.tempMin)}
                </span>
                <span className="weather-rain">{formatPrecipitation(day.precipitationProb)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StadiumDetail({ stadium }) {
  const team = getTeamInfo(stadium.team);

  return (
    <section className="stadium-detail" aria-label={`${stadium.name}の詳細`}>
      <div className="stadium-detail-heading">
        <TeamBadge stadium={stadium} />
        <div>
          <h3>{stadium.name}</h3>
          <p>{team?.official ?? stadium.team}</p>
        </div>
      </div>

      <dl className="stadium-detail-grid">
        <DetailRow label="所在地" value={stadium.address} />
        <DetailRow label="正式球場名" value={stadium.officialName} />
        <DetailRow label="収容人数" value={stadium.capacity} />
        <DetailRow label="球場の広さ" value={fieldSizeLabel(stadium)} />
        <DetailRow label="開場年" value={stadium.opened} />
        <DetailRow label="屋根" value={stadium.roof} />
      </dl>

      <a className="stadium-link" href={stadium.url} target="_blank" rel="noreferrer">
        公式サイト
      </a>

      <WeatherBlock stadium={stadium} />
    </section>
  );
}

export default function Stadiums() {
  const [selectedId, setSelectedId] = useState(STADIUMS[0].id);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());

  const selectedStadium = useMemo(
    () => STADIUMS.find(stadium => stadium.id === selectedId) ?? STADIUMS[0],
    [selectedId],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = L.map(mapElementRef.current, {
      center: [36.5, 138],
      zoom: 5,
      scrollWheelZoom: false,
    });
    const markers = markersRef.current;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    STADIUMS.forEach((stadium) => {
      const marker = L.marker([stadium.lat, stadium.lng], {
        icon: createMarkerIcon(stadium, stadium.id === STADIUMS[0].id),
        title: stadium.name,
      });
      marker.on('click', () => setSelectedId(stadium.id));
      marker.addTo(map);
      marker.bindTooltip(stadium.name, { direction: 'top', offset: [0, -16] });
      markers.set(stadium.id, marker);
      bounds.extend([stadium.lat, stadium.lng]);
    });

    map.fitBounds(bounds, { padding: [24, 24] });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    STADIUMS.forEach((stadium) => {
      markersRef.current
        .get(stadium.id)
        ?.setIcon(createMarkerIcon(stadium, stadium.id === selectedId));
    });

    mapRef.current.flyTo([selectedStadium.lat, selectedStadium.lng], 12, {
      duration: 0.7,
    });
  }, [selectedId, selectedStadium]);

  return (
    <section className="section stadium-section">
      <h2 className="section-title">球場情報</h2>

      <div className="stadium-layout">
        <div className="stadium-list" aria-label="球場一覧">
          {STADIUMS.map(stadium => (
            <StadiumListItem
              key={stadium.id}
              stadium={stadium}
              selected={stadium.id === selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <div className="stadium-map-panel">
          <div ref={mapElementRef} className="stadium-map" aria-label="本拠地球場マップ" />
        </div>

        <StadiumDetail stadium={selectedStadium} />
      </div>
    </section>
  );
}
