import { Wind } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface AirQualityTileProps {
  isDark: boolean;
}

interface PollutantData {
  label: string;
  value: number;
  unit: string;
}

interface EnvironmentalData {
  weather?: {
    temperature: number;
    humidity: number;
    pressure: number;
    windSpeed: number;
    description: string;
  };
  airQuality?: {
    aqi: number;
    pm25: number;
    pm10: number;
    o3: number;
    no2: number;
    co: number;
    so2: number;
  };
}

export function AirQualityTile({ isDark }: AirQualityTileProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: envData, error: envError, isLoading, isError, failureReason } = useQuery<EnvironmentalData>({
    queryKey: ['/api/environmental/today'],
    refetchInterval: 300000,
    retry: false, // Don't retry on 404 - no location data
  });

  // Debug logging for AQI data - fetch raw response for better error details
  useEffect(() => {
    console.log('[AQI] Query state:', { isLoading, isError, hasData: !!envData });
    if (isError) {
      console.error('[AQI] Query failed - checking raw response...');
      // Fetch directly to get error details
      fetch('/api/environmental/today', { credentials: 'include' })
        .then(res => {
          console.log('[AQI] Direct fetch status:', res.status, res.statusText);
          return res.json().catch(() => ({ parseError: true }));
        })
        .then(data => console.log('[AQI] Direct fetch response:', data))
        .catch(err => console.error('[AQI] Direct fetch error:', err));
    }
    if (envData) {
      console.log('[AQI] Data received:', { 
        hasAirQuality: !!envData.airQuality, 
        aqi: envData.airQuality?.aqi 
      });
    }
  }, [envData, isLoading, isError]);

  const aqi = envData?.airQuality?.aqi ?? null;
  
  const pollutants: PollutantData[] = [
    { label: "Fine Particles (PM2.5)", value: envData?.airQuality?.pm25 ?? 0, unit: "μg/m³" },
    { label: "Coarse Particles (PM10)", value: envData?.airQuality?.pm10 ?? 0, unit: "μg/m³" },
    { label: "Ozone (O₃)", value: envData?.airQuality?.o3 ?? 0, unit: "μg/m³" },
    { label: "Nitrogen Dioxide (NO₂)", value: envData?.airQuality?.no2 ?? 0, unit: "μg/m³" },
    { label: "Carbon Monoxide (CO)", value: envData?.airQuality?.co ?? 0, unit: "μg/m³" },
    { label: "Sulfur Dioxide (SO₂)", value: envData?.airQuality?.so2 ?? 0, unit: "μg/m³" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % pollutants.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [pollutants.length]);

  const getAQIInfo = (level: number | null) => {
    if (level === null) {
      return { color: "text-gray-500", bg: "bg-gray-500/20", label: "—" };
    }
    switch (level) {
      case 1:
        return { color: "text-green-500", bg: "bg-green-500/20", label: "Good" };
      case 2:
        return { color: "text-yellow-500", bg: "bg-yellow-500/20", label: "Moderate" };
      case 3:
        return { color: "text-orange-500", bg: "bg-orange-500/20", label: "Unhealthy for Sensitive" };
      case 4:
        return { color: "text-red-500", bg: "bg-red-500/20", label: "Unhealthy" };
      case 5:
        return { color: "text-purple-500", bg: "bg-purple-500/20", label: "Very Unhealthy" };
      default:
        return { color: "text-gray-500", bg: "bg-gray-500/20", label: "Unknown" };
    }
  };

  const aqiInfo = getAQIInfo(aqi);
  const hasData = !!envData?.airQuality;

  return (
    <div
      className={`border-b transition-colors ${
        isDark
          ? "bg-white/5 border-white/10"
          : "bg-white/70 border-black/10"
      }`}
      data-testid="tile-air-quality"
    >
      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Wind className={`w-4 h-4 ${aqiInfo.color}`} />
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs ${
                  isDark ? "text-white/60" : "text-gray-600"
                }`}
              >
                AQI:
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${aqiInfo.color} ${aqiInfo.bg}`}
              >
                {aqi ?? "—"}
              </span>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-end overflow-hidden">
            {hasData ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center gap-1"
                >
                  <span
                    className={`text-xs ${
                      isDark ? "text-white/50" : "text-gray-500"
                    }`}
                  >
                    {pollutants[currentIndex].label}:
                  </span>
                  <span
                    className={`text-xs ${
                      isDark ? "text-white/80" : "text-gray-700"
                    }`}
                  >
                    {pollutants[currentIndex].value.toFixed(1)}
                    <span
                      className={`ml-0.5 ${
                        isDark ? "text-white/40" : "text-gray-400"
                      }`}
                    >
                      {pollutants[currentIndex].unit}
                    </span>
                  </span>
                </motion.div>
              </AnimatePresence>
            ) : (
              <span
                className={`text-xs ${
                  isDark ? "text-white/40" : "text-gray-400"
                }`}
              >
                Enable location to see air quality
              </span>
            )}
          </div>

          {hasData && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {pollutants.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`h-1 rounded-full transition-all ${
                    index === currentIndex
                      ? isDark
                        ? "bg-white/70 w-3"
                        : "bg-gray-700 w-3"
                      : isDark
                        ? "bg-white/20 w-1"
                        : "bg-gray-400/40 w-1"
                  }`}
                  aria-label={`View ${pollutants[index].label}`}
                  data-testid={`button-pollutant-${index}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
