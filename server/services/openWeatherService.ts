import { createLogger } from '../utils/logger';

const logger = createLogger('OpenWeatherService');

// In-memory cache with TTL for weather data
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  location: { lat: number; lon: number };
}

// Cache TTL: 2 hours for weather, 1 hour for AQI
const WEATHER_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const AQI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Maximum staleness: 12 hours - after this, we return 503 instead of stale data
const MAX_STALENESS_MS = 12 * 60 * 60 * 1000; // 12 hours

// Rate limiting: max API calls per hour per server instance (split by endpoint)
const MAX_WEATHER_CALLS_PER_HOUR = 300;
const MAX_AQI_CALLS_PER_HOUR = 300;
let weatherCallsThisHour = 0;
let aqiCallsThisHour = 0;
let lastWeatherHourReset = Date.now();
let lastAqiHourReset = Date.now();

// Location proximity threshold (roughly 10km)
const LOCATION_PROXIMITY_THRESHOLD = 0.1; // degrees

// In-memory caches - keyed by rounded lat/lon
const weatherCache = new Map<string, CacheEntry<WeatherData>>();
const aqiCache = new Map<string, CacheEntry<AirQualityData>>();

// Global fallback: last successful fetch for any location
let lastKnownWeather: CacheEntry<WeatherData> | null = null;
let lastKnownAQI: CacheEntry<AirQualityData> | null = null;

function checkAndIncrementWeatherRateLimit(): boolean {
  const now = Date.now();
  // Reset counter every hour
  if (now - lastWeatherHourReset > 60 * 60 * 1000) {
    weatherCallsThisHour = 0;
    lastWeatherHourReset = now;
  }
  
  if (weatherCallsThisHour >= MAX_WEATHER_CALLS_PER_HOUR) {
    logger.warn(`[OpenWeather] Weather rate limit reached (${MAX_WEATHER_CALLS_PER_HOUR} calls/hour)`);
    return false;
  }
  
  weatherCallsThisHour++;
  return true;
}

function checkAndIncrementAQIRateLimit(): boolean {
  const now = Date.now();
  // Reset counter every hour
  if (now - lastAqiHourReset > 60 * 60 * 1000) {
    aqiCallsThisHour = 0;
    lastAqiHourReset = now;
  }
  
  if (aqiCallsThisHour >= MAX_AQI_CALLS_PER_HOUR) {
    logger.warn(`[OpenWeather] AQI rate limit reached (${MAX_AQI_CALLS_PER_HOUR} calls/hour)`);
    return false;
  }
  
  aqiCallsThisHour++;
  return true;
}

function isWithinMaxStaleness(timestamp: number): boolean {
  return Date.now() - timestamp < MAX_STALENESS_MS;
}

function getCacheKey(lat: number, lon: number): string {
  // Round to 1 decimal place (~10km precision) for cache grouping
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

function isWithinProximity(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return Math.abs(lat1 - lat2) < LOCATION_PROXIMITY_THRESHOLD && 
         Math.abs(lon1 - lon2) < LOCATION_PROXIMITY_THRESHOLD;
}

function isCacheValid<T>(entry: CacheEntry<T> | null | undefined, ttlMs: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttlMs;
}

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  clouds: number;
  visibility: number;
  weatherMain: string;
  weatherDescription: string;
  weatherIcon: string;
  sunrise: number;
  sunset: number;
  timezone: number;
  cityName: string;
  countryCode: string;
}

export interface AirQualityData {
  aqi: number;
  aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor';
  components: {
    co: number;
    no: number;
    no2: number;
    o3: number;
    so2: number;
    pm2_5: number;
    pm10: number;
    nh3: number;
  };
}

export interface EnvironmentalData {
  weather: WeatherData | null;
  airQuality: AirQualityData | null;
  fetchedAt: string;
  location: {
    lat: number;
    lon: number;
  };
}

export interface HistoricalEnvironmentalData extends EnvironmentalData {
  date: string;
}

const API_BASE = 'https://api.openweathermap.org/data/2.5';
const AQI_LABELS: Record<number, AirQualityData['aqiLabel']> = {
  1: 'Good',
  2: 'Fair',
  3: 'Moderate',
  4: 'Poor',
  5: 'Very Poor',
};

function getApiKey(): string {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    throw new Error('OPENWEATHER_API_KEY environment variable is not set');
  }
  return key;
}

export interface WeatherResult {
  data: WeatherData;
  timestamp: number;
  isStale: boolean;
}

export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherResult | null> {
  const cacheKey = getCacheKey(lat, lon);
  
  // Check in-memory cache first
  const cached = weatherCache.get(cacheKey);
  if (isCacheValid(cached, WEATHER_CACHE_TTL_MS)) {
    logger.info(`[OpenWeather] Using cached weather for ${cacheKey} (age: ${Math.round((Date.now() - cached!.timestamp) / 60000)}min)`);
    return { data: cached!.data, timestamp: cached!.timestamp, isStale: false };
  }
  
  // Check rate limit before making API call
  if (!checkAndIncrementWeatherRateLimit()) {
    return getFallbackWeather(lat, lon);
  }
  
  try {
    const apiKey = getApiKey();
    const url = `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`[OpenWeather] Weather API error: ${response.status} ${response.statusText}`);
      return getFallbackWeather(lat, lon);
    }
    
    const data = await response.json();
    const timestamp = Date.now();
    
    const weatherData: WeatherData = {
      temperature: data.main.temp,
      feelsLike: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg || 0,
      clouds: data.clouds.all,
      visibility: data.visibility,
      weatherMain: data.weather[0].main,
      weatherDescription: data.weather[0].description,
      weatherIcon: data.weather[0].icon,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      timezone: data.timezone,
      cityName: data.name,
      countryCode: data.sys.country,
    };
    
    // Update cache
    const cacheEntry: CacheEntry<WeatherData> = {
      data: weatherData,
      timestamp,
      location: { lat, lon }
    };
    weatherCache.set(cacheKey, cacheEntry);
    lastKnownWeather = cacheEntry;
    
    logger.info(`[OpenWeather] Fetched and cached fresh weather for ${cacheKey}`);
    return { data: weatherData, timestamp, isStale: false };
  } catch (error) {
    logger.error('[OpenWeather] Error fetching current weather:', error);
    return getFallbackWeather(lat, lon);
  }
}

function getFallbackWeather(lat: number, lon: number): WeatherResult | null {
  const cacheKey = getCacheKey(lat, lon);
  
  // Try exact location cache first (must be within max staleness)
  const cached = weatherCache.get(cacheKey);
  if (cached && isWithinMaxStaleness(cached.timestamp)) {
    const ageHours = Math.round((Date.now() - cached.timestamp) / 3600000);
    logger.warn(`[OpenWeather] Using stale cache for ${cacheKey} (${ageHours}h old) as fallback`);
    return { data: cached.data, timestamp: cached.timestamp, isStale: true };
  }
  
  // Try last known weather if within proximity and max staleness
  if (lastKnownWeather && 
      isWithinProximity(lat, lon, lastKnownWeather.location.lat, lastKnownWeather.location.lon) &&
      isWithinMaxStaleness(lastKnownWeather.timestamp)) {
    const ageHours = Math.round((Date.now() - lastKnownWeather.timestamp) / 3600000);
    logger.warn(`[OpenWeather] Using last known weather (${ageHours}h old) from nearby location as fallback`);
    return { data: lastKnownWeather.data, timestamp: lastKnownWeather.timestamp, isStale: true };
  }
  
  // Cache too old or doesn't exist - reject with null (will cause 503)
  logger.warn(`[OpenWeather] No valid fallback weather available for ${cacheKey} (cache older than ${MAX_STALENESS_MS / 3600000}h)`);
  return null;
}

export interface AQIResult {
  data: AirQualityData;
  timestamp: number;
  isStale: boolean;
}

export async function getCurrentAirQuality(lat: number, lon: number): Promise<AQIResult | null> {
  const cacheKey = getCacheKey(lat, lon);
  
  // Check in-memory cache first
  const cached = aqiCache.get(cacheKey);
  if (isCacheValid(cached, AQI_CACHE_TTL_MS)) {
    logger.info(`[OpenWeather] Using cached AQI for ${cacheKey} (age: ${Math.round((Date.now() - cached!.timestamp) / 60000)}min)`);
    return { data: cached!.data, timestamp: cached!.timestamp, isStale: false };
  }
  
  // Check rate limit before making API call
  if (!checkAndIncrementAQIRateLimit()) {
    return getFallbackAQI(lat, lon);
  }
  
  try {
    const apiKey = getApiKey();
    const url = `${API_BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`[OpenWeather] Air Quality API error: ${response.status} ${response.statusText}`);
      return getFallbackAQI(lat, lon);
    }
    
    const data = await response.json();
    const item = data.list[0];
    const timestamp = Date.now();
    
    const aqiData: AirQualityData = {
      aqi: item.main.aqi,
      aqiLabel: AQI_LABELS[item.main.aqi] || 'Moderate',
      components: {
        co: item.components.co,
        no: item.components.no,
        no2: item.components.no2,
        o3: item.components.o3,
        so2: item.components.so2,
        pm2_5: item.components.pm2_5,
        pm10: item.components.pm10,
        nh3: item.components.nh3,
      },
    };
    
    // Update cache
    const cacheEntry: CacheEntry<AirQualityData> = {
      data: aqiData,
      timestamp,
      location: { lat, lon }
    };
    aqiCache.set(cacheKey, cacheEntry);
    lastKnownAQI = cacheEntry;
    
    logger.info(`[OpenWeather] Fetched and cached fresh AQI for ${cacheKey}`);
    return { data: aqiData, timestamp, isStale: false };
  } catch (error) {
    logger.error('[OpenWeather] Error fetching air quality:', error);
    return getFallbackAQI(lat, lon);
  }
}

function getFallbackAQI(lat: number, lon: number): AQIResult | null {
  const cacheKey = getCacheKey(lat, lon);
  
  // Try exact location cache first (must be within max staleness)
  const cached = aqiCache.get(cacheKey);
  if (cached && isWithinMaxStaleness(cached.timestamp)) {
    const ageHours = Math.round((Date.now() - cached.timestamp) / 3600000);
    logger.warn(`[OpenWeather] Using stale AQI cache for ${cacheKey} (${ageHours}h old) as fallback`);
    return { data: cached.data, timestamp: cached.timestamp, isStale: true };
  }
  
  // Try last known AQI if within proximity and max staleness
  if (lastKnownAQI && 
      isWithinProximity(lat, lon, lastKnownAQI.location.lat, lastKnownAQI.location.lon) &&
      isWithinMaxStaleness(lastKnownAQI.timestamp)) {
    const ageHours = Math.round((Date.now() - lastKnownAQI.timestamp) / 3600000);
    logger.warn(`[OpenWeather] Using last known AQI (${ageHours}h old) from nearby location as fallback`);
    return { data: lastKnownAQI.data, timestamp: lastKnownAQI.timestamp, isStale: true };
  }
  
  // Cache too old or doesn't exist - reject with null (will cause 503)
  logger.warn(`[OpenWeather] No valid fallback AQI available for ${cacheKey} (cache older than ${MAX_STALENESS_MS / 3600000}h)`);
  return null;
}

export async function getHistoricalAirQuality(
  lat: number, 
  lon: number, 
  startTimestamp: number, 
  endTimestamp: number
): Promise<AirQualityData[]> {
  try {
    const apiKey = getApiKey();
    const url = `${API_BASE}/air_pollution/history?lat=${lat}&lon=${lon}&start=${startTimestamp}&end=${endTimestamp}&appid=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`[OpenWeather] Historical AQ API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    return data.list.map((item: any) => ({
      aqi: item.main.aqi,
      aqiLabel: AQI_LABELS[item.main.aqi] || 'Moderate',
      components: {
        co: item.components.co,
        no: item.components.no,
        no2: item.components.no2,
        o3: item.components.o3,
        so2: item.components.so2,
        pm2_5: item.components.pm2_5,
        pm10: item.components.pm10,
        nh3: item.components.nh3,
      },
    }));
  } catch (error) {
    logger.error('[OpenWeather] Error fetching historical air quality:', error);
    return [];
  }
}

export async function getAirQualityForecast(lat: number, lon: number): Promise<AirQualityData[]> {
  try {
    const apiKey = getApiKey();
    const url = `${API_BASE}/air_pollution/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`[OpenWeather] AQ Forecast API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    return data.list.map((item: any) => ({
      aqi: item.main.aqi,
      aqiLabel: AQI_LABELS[item.main.aqi] || 'Moderate',
      components: {
        co: item.components.co,
        no: item.components.no,
        no2: item.components.no2,
        o3: item.components.o3,
        so2: item.components.so2,
        pm2_5: item.components.pm2_5,
        pm10: item.components.pm10,
        nh3: item.components.nh3,
      },
    }));
  } catch (error) {
    logger.error('[OpenWeather] Error fetching air quality forecast:', error);
    return [];
  }
}

export interface EnvironmentalDataWithMeta extends EnvironmentalData {
  isStale: boolean;
  weatherTimestamp: number | null;
  aqiTimestamp: number | null;
}

export async function getEnvironmentalData(lat: number, lon: number): Promise<EnvironmentalDataWithMeta> {
  const [weatherResult, aqiResult] = await Promise.all([
    getCurrentWeather(lat, lon),
    getCurrentAirQuality(lat, lon),
  ]);
  
  // Use the oldest timestamp as fetchedAt to accurately represent data freshness
  const timestamps = [weatherResult?.timestamp, aqiResult?.timestamp].filter(Boolean) as number[];
  const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const isStale = (weatherResult?.isStale ?? false) || (aqiResult?.isStale ?? false);
  
  return {
    weather: weatherResult?.data ?? null,
    airQuality: aqiResult?.data ?? null,
    fetchedAt: new Date(oldestTimestamp).toISOString(),
    location: { lat, lon },
    isStale,
    weatherTimestamp: weatherResult?.timestamp ?? null,
    aqiTimestamp: aqiResult?.timestamp ?? null,
  };
}

export function formatWeatherForContext(data: EnvironmentalData): string {
  const parts: string[] = [];
  
  if (data.weather) {
    const w = data.weather;
    parts.push(`Weather: ${w.weatherDescription}, ${Math.round(w.temperature)}°C (feels like ${Math.round(w.feelsLike)}°C)`);
    parts.push(`Humidity: ${w.humidity}%, Wind: ${w.windSpeed} m/s`);
    
    if (w.temperature > 30) {
      parts.push('⚠️ High heat - may affect HRV and exercise capacity');
    } else if (w.temperature < 5) {
      parts.push('⚠️ Cold conditions - monitor for respiratory impact');
    }
    
    if (w.humidity > 80) {
      parts.push('⚠️ High humidity - may affect sleep and recovery');
    }
  }
  
  if (data.airQuality) {
    const aq = data.airQuality;
    parts.push(`Air Quality: ${aq.aqiLabel} (AQI ${aq.aqi})`);
    parts.push(`PM2.5: ${aq.components.pm2_5.toFixed(1)} µg/m³, O₃: ${aq.components.o3.toFixed(1)} µg/m³`);
    
    if (aq.aqi >= 4) {
      parts.push('⚠️ Poor air quality - limit outdoor exercise, may affect respiratory function');
    } else if (aq.aqi === 3) {
      parts.push('⚠️ Moderate air quality - sensitive individuals should limit prolonged outdoor exertion');
    }
  }
  
  return parts.join('\n');
}

export function assessEnvironmentalStress(data: EnvironmentalData): {
  heatStress: number;
  coldStress: number;
  airQualityStress: number;
  overallStress: number;
  factors: string[];
} {
  let heatStress = 0;
  let coldStress = 0;
  let airQualityStress = 0;
  const factors: string[] = [];
  
  if (data.weather) {
    const temp = data.weather.temperature;
    const humidity = data.weather.humidity;
    
    if (temp > 35) {
      heatStress = 1.0;
      factors.push('Extreme heat');
    } else if (temp > 30) {
      heatStress = 0.7;
      factors.push('High heat');
    } else if (temp > 27) {
      heatStress = 0.4;
      factors.push('Warm conditions');
    }
    
    if (heatStress > 0 && humidity > 70) {
      heatStress = Math.min(1.0, heatStress + 0.2);
      factors.push('High humidity compounds heat stress');
    }
    
    if (temp < 0) {
      coldStress = 0.8;
      factors.push('Freezing temperatures');
    } else if (temp < 5) {
      coldStress = 0.5;
      factors.push('Cold conditions');
    } else if (temp < 10) {
      coldStress = 0.2;
      factors.push('Cool conditions');
    }
  }
  
  if (data.airQuality) {
    const aqi = data.airQuality.aqi;
    if (aqi === 5) {
      airQualityStress = 1.0;
      factors.push('Very poor air quality');
    } else if (aqi === 4) {
      airQualityStress = 0.7;
      factors.push('Poor air quality');
    } else if (aqi === 3) {
      airQualityStress = 0.4;
      factors.push('Moderate air quality');
    } else if (aqi === 2) {
      airQualityStress = 0.1;
    }
  }
  
  const overallStress = Math.max(heatStress, coldStress, airQualityStress);
  
  return {
    heatStress,
    coldStress,
    airQualityStress,
    overallStress,
    factors,
  };
}

logger.info('[OpenWeather] Service initialized');
