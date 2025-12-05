import { createLogger } from '../utils/logger';

const logger = createLogger('OpenWeatherService');

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

export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const apiKey = getApiKey();
    const url = `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`[OpenWeather] Weather API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    return {
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
  } catch (error) {
    logger.error('[OpenWeather] Error fetching current weather:', error);
    return null;
  }
}

export async function getCurrentAirQuality(lat: number, lon: number): Promise<AirQualityData | null> {
  try {
    const apiKey = getApiKey();
    const url = `${API_BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`[OpenWeather] Air Quality API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    const item = data.list[0];
    
    return {
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
  } catch (error) {
    logger.error('[OpenWeather] Error fetching air quality:', error);
    return null;
  }
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

export async function getEnvironmentalData(lat: number, lon: number): Promise<EnvironmentalData> {
  const [weather, airQuality] = await Promise.all([
    getCurrentWeather(lat, lon),
    getCurrentAirQuality(lat, lon),
  ]);
  
  return {
    weather,
    airQuality,
    fetchedAt: new Date().toISOString(),
    location: { lat, lon },
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
