import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  CloudDrizzle, Thermometer, Droplets, Wind, MapPin,
} from "lucide-react";

interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  city: string;
}

type WeatherCondition = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunderstorm";

function classifyWeather(code: number): WeatherCondition {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "thunderstorm";
  return "cloudy";
}

function weatherLabel(code: number): string {
  const labels: Record<number, string> = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall",
    77: "Snow grains", 80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm",
  };
  return labels[code] || "Unknown";
}

function WeatherIcon({ code, isDay, className }: { code: number; isDay: boolean; className?: string }) {
  const condition = classifyWeather(code);
  const props = { className: className || "w-10 h-10" };
  switch (condition) {
    case "clear": return <Sun {...props} />;
    case "cloudy": return <Cloud {...props} />;
    case "fog": return <CloudFog {...props} />;
    case "drizzle": return <CloudDrizzle {...props} />;
    case "rain": return <CloudRain {...props} />;
    case "snow": return <CloudSnow {...props} />;
    case "thunderstorm": return <CloudLightning {...props} />;
    default: return <Cloud {...props} />;
  }
}

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
}

interface SurfaceDroplet {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  wiped: boolean;
  vy: number;
}

function useRainCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean,
  condition: WeatherCondition
) {
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const raindropsRef = useRef<RainDrop[]>([]);
  const dropletsRef = useRef<SurfaceDroplet[]>([]);
  const animFrameRef = useRef<number>(0);
  const hasWipedRef = useRef(false);

  const initFog = useCallback((w: number, h: number) => {
    const fc = document.createElement("canvas");
    fc.width = w;
    fc.height = h;
    const ctx = fc.getContext("2d")!;
    ctx.fillStyle = "rgba(190, 205, 215, 0.5)";
    ctx.fillRect(0, 0, w, h);
    fogCanvasRef.current = fc;
  }, []);

  const initRaindrops = useCallback((w: number, h: number) => {
    const count = condition === "drizzle" ? 30 : condition === "thunderstorm" ? 100 : 60;
    raindropsRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 2 + Math.random() * 4,
      length: 8 + Math.random() * 15,
      opacity: 0.15 + Math.random() * 0.3,
    }));
  }, [condition]);

  const initDroplets = useCallback((w: number, h: number) => {
    dropletsRef.current = Array.from({ length: 25 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: 2 + Math.random() * 5,
      opacity: 0.3 + Math.random() * 0.5,
      wiped: false,
      vy: 0,
    }));
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    initFog(canvas.width, canvas.height);
    initRaindrops(w, h);
    initDroplets(w, h);

    let lastDropletTime = 0;

    function drawDroplet(ctx: CanvasRenderingContext2D, d: SurfaceDroplet) {
      ctx.save();
      ctx.globalAlpha = d.opacity;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(
        d.x - d.radius * 0.3, d.y - d.radius * 0.3, 0,
        d.x, d.y, d.radius
      );
      grad.addColorStop(0, "rgba(255, 255, 255, 0.6)");
      grad.addColorStop(0.5, "rgba(200, 220, 240, 0.3)");
      grad.addColorStop(1, "rgba(150, 180, 210, 0.15)");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(d.x - d.radius * 0.25, d.y - d.radius * 0.25, d.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();
      ctx.restore();
    }

    function render(time: number) {
      ctx.clearRect(0, 0, w, h);

      const fogC = fogCanvasRef.current;
      if (fogC) {
        const fCtx = fogC.getContext("2d")!;
        fCtx.fillStyle = "rgba(190, 205, 215, 0.004)";
        fCtx.fillRect(0, 0, fogC.width, fogC.height);

        const mouse = mouseRef.current;
        if (mouse) {
          fCtx.save();
          fCtx.globalCompositeOperation = "destination-out";
          const gradient = fCtx.createRadialGradient(
            mouse.x * dpr, mouse.y * dpr, 0,
            mouse.x * dpr, mouse.y * dpr, 35 * dpr
          );
          gradient.addColorStop(0, "rgba(0,0,0,0.7)");
          gradient.addColorStop(1, "rgba(0,0,0,0)");
          fCtx.fillStyle = gradient;
          fCtx.beginPath();
          fCtx.arc(mouse.x * dpr, mouse.y * dpr, 35 * dpr, 0, Math.PI * 2);
          fCtx.fill();
          fCtx.restore();
        }
      }

      raindropsRef.current.forEach((drop) => {
        drop.y += drop.speed;
        if (drop.y > h) {
          drop.y = -drop.length;
          drop.x = Math.random() * w;
        }
        ctx.strokeStyle = `rgba(200, 220, 240, ${drop.opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + 0.5, drop.y + drop.length);
        ctx.stroke();
      });

      if (fogC) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(fogC, 0, 0, canvas!.width, canvas!.height, 0, 0, w, h);
        ctx.restore();
      }

      const mouse = mouseRef.current;
      dropletsRef.current.forEach((d) => {
        if (d.wiped) {
          d.vy += 0.15;
          d.y += d.vy;
          d.opacity -= 0.015;
          d.radius *= 0.998;
        } else if (mouse) {
          const dx = d.x - mouse.x;
          const dy = d.y - mouse.y;
          if (Math.sqrt(dx * dx + dy * dy) < 30) {
            d.wiped = true;
            d.vy = 0.5;
            hasWipedRef.current = true;
          }
        }
        if (d.opacity > 0) drawDroplet(ctx, d);
      });

      dropletsRef.current = dropletsRef.current.filter((d) => d.opacity > 0 && d.y < h + 20);

      if (time - lastDropletTime > 800 && dropletsRef.current.length < 30) {
        dropletsRef.current.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.5,
          radius: 2 + Math.random() * 4,
          opacity: 0.3 + Math.random() * 0.4,
          wiped: false,
          vy: 0,
        });
        lastDropletTime = time;
      }

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [active, canvasRef, initFog, initRaindrops, initDroplets]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseLeave = useCallback(() => {
    mouseRef.current = null;
  }, []);

  return { onMouseMove, onMouseLeave, hasWiped: hasWipedRef };
}

interface SnowFlake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  opacity: number;
}

function useSnowCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const flakes: SnowFlake[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: 1 + Math.random() * 3,
      speed: 0.3 + Math.random() * 1,
      drift: (Math.random() - 0.5) * 0.5,
      opacity: 0.4 + Math.random() * 0.5,
    }));

    function render() {
      ctx.clearRect(0, 0, w, h);
      flakes.forEach((f) => {
        f.y += f.speed;
        f.x += f.drift + Math.sin(f.y * 0.01) * 0.3;
        if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
        if (f.x > w) f.x = 0;
        if (f.x < 0) f.x = w;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
        ctx.fill();
      });
      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [active, canvasRef]);
}

interface WeatherWidgetProps {
  isDark: boolean;
}

export default function WeatherWidget({ isDark }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const condition = weather ? classifyWeather(weather.weatherCode) : "clear";
  const isRainy = condition === "rain" || condition === "drizzle" || condition === "thunderstorm";
  const isSnowy = condition === "snow";

  const { onMouseMove, onMouseLeave, hasWiped } = useRainCanvas(canvasRef, isRainy && !loading, condition);
  useSnowCanvas(canvasRef, isSnowy && !loading);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        let lat: number | null = null;
        let lon: number | null = null;
        let city = "";

        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch {
          try {
            const ipResp = await fetch("https://ipapi.co/json/");
            const ipData = await ipResp.json();
            lat = ipData.latitude;
            lon = ipData.longitude;
            city = ipData.city || "";
          } catch {}
        }

        if (lat === null || lon === null) {
          if (!cancelled) { setError(true); setLoading(false); }
          return;
        }

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=auto`;
        const wResp = await fetch(weatherUrl);
        const wData = await wResp.json();

        if (!city) {
          try {
            const geoResp = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
              { headers: { "User-Agent": "MathomHouse/1.0" } }
            );
            const geoData = await geoResp.json();
            city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.state || "";
          } catch {}
        }

        if (!cancelled) {
          setWeather({
            temperature: Math.round(wData.current.temperature_2m),
            humidity: wData.current.relative_humidity_2m,
            windSpeed: Math.round(wData.current.wind_speed_10m),
            weatherCode: wData.current.weather_code,
            isDay: wData.current.is_day === 1,
            city: city || "Your location",
          });
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, []);

  const conditionColors: Record<WeatherCondition, string> = {
    clear: "from-amber-500/10 to-yellow-500/5",
    cloudy: "from-slate-400/10 to-gray-500/5",
    fog: "from-gray-300/15 to-slate-400/10",
    drizzle: "from-blue-400/10 to-slate-500/5",
    rain: "from-blue-500/15 to-slate-600/10",
    snow: "from-blue-100/15 to-white/10",
    thunderstorm: "from-purple-500/15 to-slate-700/10",
  };

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-2xl p-5 backdrop-blur-xl transition-all duration-500 ${
          isDark
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100"
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-3">
          <Cloud className="w-3.5 h-3.5 text-[#C5A059]" />
          <span>Weather Outside</span>
        </div>
        <p className={`text-sm italic font-light ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
          The skies are beyond our sight today. Grant location access to peek outside.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`weather-widget relative overflow-hidden rounded-2xl p-5 backdrop-blur-xl transition-all duration-500 ${
        isDark
          ? "bg-[#12100E]/70 border border-white/10 text-neutral-100"
          : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
      } ${isRainy ? "weather-rainy" : ""} ${isSnowy ? "weather-snowy" : ""}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${conditionColors[condition]} pointer-events-none`} />

      {(isRainy || isSnowy) && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-20"
          style={{ cursor: isRainy ? "grab" : "default" }}
          onMouseMove={isRainy ? onMouseMove : undefined}
          onMouseLeave={isRainy ? onMouseLeave : undefined}
        />
      )}

      {loading ? (
        <div className="relative z-10 flex items-center gap-3 py-2">
          <Cloud className={`w-6 h-6 animate-pulse ${isDark ? "text-neutral-500" : "text-stone-400"}`} />
          <span className={`text-sm font-light ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
            Peering through the window...
          </span>
        </div>
      ) : weather ? (
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-3">
            <Thermometer className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Weather Outside</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-3xl font-bold font-serif transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>
                {weather.temperature}°C
              </h3>
              <p className={`text-sm font-light mt-0.5 transition-colors ${isDark ? "text-neutral-300" : "text-stone-600"}`}>
                {weatherLabel(weather.weatherCode)}
              </p>
              <div className={`flex items-center gap-1 mt-1 text-xs transition-colors ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
                <MapPin className="w-3 h-3" />
                <span>{weather.city}</span>
              </div>
            </div>
            <WeatherIcon
              code={weather.weatherCode}
              isDay={weather.isDay}
              className={`w-12 h-12 ${
                condition === "clear"
                  ? "text-amber-400"
                  : condition === "snow"
                  ? isDark ? "text-blue-200" : "text-blue-300"
                  : condition === "thunderstorm"
                  ? "text-purple-400"
                  : isDark ? "text-neutral-400" : "text-stone-500"
              }`}
            />
          </div>

          <div className={`flex gap-4 mt-3 text-xs font-mono transition-colors ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
            <span className="flex items-center gap-1">
              <Droplets className="w-3 h-3" /> {weather.humidity}%
            </span>
            <span className="flex items-center gap-1">
              <Wind className="w-3 h-3" /> {weather.windSpeed} km/h
            </span>
          </div>

          {isRainy && !hasWiped.current && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
              className="absolute bottom-2 right-3 text-[10px] opacity-40 z-30 pointer-events-none italic"
            >
              wipe the fog with your mouse...
            </motion.p>
          )}
        </div>
      ) : null}

      {condition === "thunderstorm" && <ThunderFlash />}
    </motion.div>
  );
}

function ThunderFlash() {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.3) {
        setFlash(true);
        setTimeout(() => setFlash(false), 100);
        setTimeout(() => {
          setFlash(true);
          setTimeout(() => setFlash(false), 60);
        }, 150);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!flash) return null;
  return <div className="absolute inset-0 bg-white/20 z-15 pointer-events-none rounded-2xl" />;
}
