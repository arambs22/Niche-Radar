# NicheRadar

![Status](https://img.shields.io/badge/status-under%20development-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)

Herramienta gratuita y de código abierto para detectar tendencias de diseño y
estética **antes de que se saturen** en marketplaces como Etsy — pensada para
creadores de clip art y assets digitales generados con IA.

## Why (¿por qué existe esto?)

Herramientas como eRank o Trend2Design resuelven este problema, pero son de
pago y de código cerrado. NicheRadar busca ofrecer lo esencial —seguimiento
de volumen de búsqueda en Google Trends, búsquedas relacionadas en alza, y
(opcionalmente) cruce con listings reales de Etsy para medir saturación— de
forma gratuita, transparente y fácil de auto-hospedar.

Nace como proyecto personal de [Kliparama](https://www.etsy.com/shop/Kliparama)
(tienda de clip art en Etsy) y como pieza de portafolio técnico.

## Stack técnico

- **Backend:** TypeScript + Express
- **Base de datos:** PostgreSQL (vía Docker Compose)
- **Datos de tendencias:** Google Trends (no requiere API key)
- **Integración opcional:** Etsy Open API v3 (requiere API key propia)
- **Dashboard:** por definir (se documentará al llegar a esa fase)

## Getting Started

> 🚧 El proyecto está en construcción. Esta sección se irá completando con
> instrucciones reales conforme avancen las fases de desarrollo.

## Licencia

[MIT](./LICENSE) © 2026 Aram Barsegyan
