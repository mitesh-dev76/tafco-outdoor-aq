// Screen settings. Edit these values to set up a different site.
window.AIR_CONFIG = {
	// Shown in the header.
	site: {
		name: "Ahmedabad Office",
		area: "Reception",
	},
	// Where outdoor air is measured (live data from Open-Meteo).
	outdoorPlace: {
		name: "Ahmedabad",
		latitude: 23.0225,
		longitude: 72.5714,
	},
	sensorName: "TAFCO IAQ-01",

	// Fetch new outdoor data every N minutes.
	autoRefreshMinutes: 15,

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
