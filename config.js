// Screen settings. Edit these values to set up a different site.
window.AIR_CONFIG = {
	// Shown in the header.
	site: {
		name: "Ahmedabad Office",
		area: "Reception",
	},
	// Where outdoor air is measured (live data from Open-Meteo).
	outdoorPlace: {
		name: "Aya Nagar (IMD), Delhi",
		latitude: 28.4707,
		longitude: 77.1099,
	},
	// Real monitoring station from WAQI (aqicn.org). Get a free token at
	// https://aqicn.org/data-platform/token and paste it below.
	// id: "geo:LAT;LON" picks the nearest station, or "@1234" a specific one.
	// Leave token empty to use the Open-Meteo model for outdoorPlace instead.
	station: {
		token: "",
		id: "geo:28.4707;77.1099",
	},
	sensorName: "TAFCO IAQ-01",

	// Fetch new outdoor data every N minutes (real data is disabled in app.js).
	autoRefreshMinutes: 5,

	// Static outdoor PM2.5 (µg/m³): climbs through these values over 60 s,
	// then back down over the next 60 s, changing every N seconds.
	// PM10 is PM2.5 × outdoorPm10Ratio. Category and AQI follow CPCB.
	outdoorIntervalSeconds: 3,
	outdoorSamples: [25, 56, 74, 89, 138, 170, 203, 255, 314, 408],
	outdoorPm10Ratio: 1.7,

	// Indoor sensor is not connected yet: the screen loops through these
	// static readings (µg/m³), moving to the next one every N seconds.
	// Keep neighbouring values close so the number never jumps.
	// Indoor values are always kept below outdoor values on screen.
	indoorIntervalSeconds: 6,
	indoorSamples: [
		{ pm2_5: 8.2, pm10: 14.1 },
		{ pm2_5: 8.4, pm10: 14.3 },
		{ pm2_5: 8.7, pm10: 14.8 },
		{ pm2_5: 8.5, pm10: 14.6 },
		{ pm2_5: 8.1, pm10: 14.0 },
		{ pm2_5: 7.8, pm10: 13.6 },
		{ pm2_5: 7.6, pm10: 13.3 },
		{ pm2_5: 7.9, pm10: 13.7 },
		{ pm2_5: 8.3, pm10: 14.2 },
		{ pm2_5: 8.6, pm10: 14.5 },
	],
};
