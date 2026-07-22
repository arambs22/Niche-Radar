[1mdiff --git a/src/services/trendCollector.service.ts b/src/services/trendCollector.service.ts[m
[1mindex f8f7365..f2bf00c 100644[m
[1m--- a/src/services/trendCollector.service.ts[m
[1m+++ b/src/services/trendCollector.service.ts[m
[36m@@ -62,7 +62,7 @@[m [masync function collectForKeywordAndRegion([m
     .limit(1);[m
 [m
   if (alreadyCollectedToday.length > 0) {[m
[31m-    logger.info(`  [${geo || "worldwide"}] ⏭ ya recolectado hoy`);[m
[32m+[m[32m    logger.info(`  [${geo || "worldwide"}] "${term}" ⏭ ya recolectado hoy`);[m
     return "skipped";[m
   }[m
 [m
[36m@@ -88,7 +88,7 @@[m [masync function collectForKeywordAndRegion([m
     }[m
 [m
     logger.info([m
[31m-      `  [${geo || "worldwide"}] ${timeline.length} snapshots, ${rising.length} related queries`[m
[32m+[m[32m      `  [${geo || "worldwide"}] "${term}" ✓ ${timeline.length} snapshots, ${rising.length} related queries`[m
     );[m
     return "success";[m
   } catch (err) {[m
