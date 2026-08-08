import { collectTrendsForAllUsers } from "../services/trendCollector.service.js";

const geoArg = process.argv.find((arg) => arg.startsWith("--geo="));
const geo = geoArg ? geoArg.split("=")[1]! : "";

console.log(`Starting collection for geo="${geo || "worldwide"}"...`);

collectTrendsForAllUsers(geo)
  .then(() => {
    console.log(`Collection finished for geo="${geo || "worldwide"}".`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Collection failed:", err);
    process.exit(1);
  });