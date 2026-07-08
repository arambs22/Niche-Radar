import { collectTrendsForAll } from "../services/trendCollector.service.js";
import { TRACKED_KEYWORDS } from "../config/keywords.js";

// Uso: npm run collect -- --geo=US
// Sin --geo, por defecto es mundial ("").
const geoArg = process.argv.find((arg) => arg.startsWith("--geo="));
const geo = geoArg ? geoArg.split("=")[1]! : "";

console.log(`Iniciando recolección para geo="${geo || "worldwide"}"...`);

collectTrendsForAll(TRACKED_KEYWORDS, geo)
  .then(() => {
    console.log(`Recolección terminada para geo="${geo || "worldwide"}".`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("La recolección falló:", err);
    process.exit(1);
  });