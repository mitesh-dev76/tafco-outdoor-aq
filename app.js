(() => {
	"use strict";

	const CONFIG = window.AIR_CONFIG;
	const API = "https://air-quality-api.open-meteo.com/v1/air-quality";

	// US EPA PM2.5 bands (µg/m³) with matching AQI breakpoints.
	const PM25_BANDS = [
		{ max: 12, aqi: [0, 50], label: "Good", color: "#22c55e", ink: "#0b0b0c" },
		{ max: 35.4, aqi: [51, 100], label: "Moderate", color: "#facc15", ink: "#0b0b0c" },
		{ max: 55.4, aqi: [101, 150], label: "Sensitive", color: "#fb923c", ink: "#0b0b0c" },
		{ max: 150.4, aqi: [151, 200], label: "Unhealthy", color: "#ff1f1f", ink: "#0b0b0c" },
		{ max: 250.4, aqi: [201, 300], label: "Very unhealthy", color: "#a855f7", ink: "#ffffff" },
		{ max: 500.4, aqi: [301, 500], label: "Hazardous", color: "#7f1d1d", ink: "#ffffff" },
	];

	const $ = (id) => document.getElementById(id);
	const root = document.documentElement;
	const state = { outdoor: null, fetchedAt: null, indoorIndex: 0, indoor: null };

	// ---------- helpers ----------
	const bandFor = (pm) => PM25_BANDS.find((b) => pm <= b.max) ?? PM25_BANDS[PM25_BANDS.length - 1];
	function aqiFromPm25(pm) {
		const i = PM25_BANDS.indexOf(bandFor(pm));
		const lo = i === 0 ? 0 : PM25_BANDS[i - 1].max + 0.1;
		const b = PM25_BANDS[i];
		return Math.round(b.aqi[0] + ((b.aqi[1] - b.aqi[0]) * (Math.min(pm, b.max) - lo)) / (b.max - lo));
	}
	const fmt = (v) => (v == null || Number.isNaN(v) ? "–" : v >= 100 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 0 : 1));
	const pad = (n) => String(n).padStart(2, "0");

	// Indoor must read lower than outdoor. If outdoor is unusually clean,
	// scale the sample down instead of clamping, so it keeps its gentle drift.
	function indoorReading() {
		const s = CONFIG.indoorSamples[state.indoorIndex];
		if (!state.outdoor) return { ...s };
		const ceil = (key) => {
			const maxSample = Math.max(...CONFIG.indoorSamples.map((x) => x[key]));
			const limit = state.outdoor[key] * 0.6;
			return maxSample > limit ? limit / maxSample : 1;
		};
		return { pm2_5: s.pm2_5 * ceil("pm2_5"), pm10: s.pm10 * ceil("pm10") };
	}

	// ---------- rendering ----------
	function renderIndoor() {
		const r = indoorReading();
		state.indoor = r;
		const band = bandFor(r.pm2_5);
		root.style.setProperty("--in", band.color);
		root.style.setProperty("--in-ink", band.ink);
		$("in-pm25").textContent = fmt(r.pm2_5);
		$("in-pm10").textContent = fmt(r.pm10);
		$("in-aqi").textContent = aqiFromPm25(r.pm2_5);
		$("in-badge").textContent = band.label;
		const now = new Date();
		$("updated").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
		renderDelta();
	}

	function renderOutdoor() {
		const o = state.outdoor;
		const band = bandFor(o.pm2_5);
		root.style.setProperty("--out", band.color);
		root.style.setProperty("--out-ink", band.ink);
		$("out-pm25").textContent = fmt(o.pm2_5);
		$("out-pm10").textContent = fmt(o.pm10);
		$("out-aqi").textContent = o.us_aqi != null ? Math.round(o.us_aqi) : aqiFromPm25(o.pm2_5);
		$("out-badge").textContent = band.label;
		renderDelta();
	}

	function renderDelta() {
		if (!state.outdoor || !state.indoor || !state.outdoor.pm2_5) return;
		const pct = Math.round((1 - state.indoor.pm2_5 / state.outdoor.pm2_5) * 100);
		$("delta").textContent = `−${pct}%`;
		Flow.set(state.outdoor.pm2_5, state.indoor.pm2_5 / state.outdoor.pm2_5);
	}

	function tickClock() {
		const now = new Date();
		$("clock-time").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
		$("clock-date").textContent = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/^(\w+)/, "$1,").replace(",,", ",");
		if (state.fetchedAt) {
			const s = Math.round((now - state.fetchedAt) / 1000);
			$("ago").textContent = s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} min ago`;
		}
	}

	// ---------- data ----------
	async function loadOutdoor() {
		const p = CONFIG.outdoorPlace;
		const url = `${API}?latitude=${p.latitude}&longitude=${p.longitude}&current=us_aqi,pm2_5,pm10&timezone=auto`;
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Air quality service returned ${res.status}`);
			const json = await res.json();
			state.outdoor = json.current;
			state.fetchedAt = new Date();
			$("feed-state").textContent = "Online";
			document.querySelector(".live").classList.remove("off");
			renderOutdoor();
			renderIndoor();
		} catch (err) {
			console.error(err);
			$("feed-state").textContent = "Offline";
			document.querySelector(".live").classList.add("off");
			if (!state.outdoor) $("out-badge").textContent = "Offline";
		}
	}

	// ---------- particles flowing through the filter ----------
	const Flow = (() => {
		const canvas = $("flow");
		const ctx = canvas.getContext("2d");
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		let w = 0, h = 0, dpr = 1, parts = [], rate = 0.4, pass = 0.12;
		const lines = [0.12, 0.2, 0.28, 0.36, 0.44]; // filter layers, as a fraction of width

		function resize() {
			dpr = Math.min(2, window.devicePixelRatio || 1);
			const r = canvas.getBoundingClientRect();
			w = r.width; h = r.height;
			canvas.width = w * dpr; canvas.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		function spawn(x) {
			return { x: x ?? w + 4, y: Math.random() * h, vx: -(0.35 + Math.random() * 0.5), r: 0.8 + Math.random() * 1.6, a: 0.25 + Math.random() * 0.5, tested: false, alive: true };
		}
		function frame() {
			ctx.clearRect(0, 0, w, h);
			const fx = lines[lines.length - 1] * w;
			lines.forEach((f, i) => {
				ctx.strokeStyle = i === lines.length - 1 ? getComputedStyle(root).getPropertyValue("--out") : "#1f1f22";
				ctx.globalAlpha = i === lines.length - 1 ? 1 : 0.55;
				ctx.lineWidth = i === lines.length - 1 ? 2 : 1;
				ctx.beginPath(); ctx.moveTo(f * w, h * 0.04); ctx.lineTo(f * w, h * 0.96); ctx.stroke();
			});
			ctx.globalAlpha = 1;
			if (Math.random() < rate) parts.push(spawn());
			ctx.fillStyle = "#3f3f46";
			for (const p of parts) {
				p.x += p.vx; p.y += Math.sin(p.x * 0.05) * 0.15;
				if (!p.tested && p.x < fx) { p.tested = true; p.alive = Math.random() < pass; }
				if (!p.alive) continue;
				ctx.globalAlpha = p.a * Math.min(1, p.x / 20);
				ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
			}
			ctx.globalAlpha = 1;
			parts = parts.filter((p) => p.alive && p.x > -4);
			if (!reduce) requestAnimationFrame(frame);
		}
		resize();
		addEventListener("resize", resize);
		for (let i = 0; i < 30; i++) parts.push(spawn(lines[lines.length - 1] * w + Math.random() * w * 0.56));
		requestAnimationFrame(frame);
		return {
			set(outPm, ratio) {
				rate = Math.min(1.5, 0.15 + outPm / 60);
				pass = Math.max(0.03, Math.min(0.6, ratio));
				if (reduce) requestAnimationFrame(frame);
			},
		};
	})();

	// ---------- start ----------
	$("sensor-name").textContent = CONFIG.sensorName;
	tickClock();
	setInterval(tickClock, 1000);
	renderIndoor();
	loadOutdoor();
	setInterval(() => {
		state.indoorIndex = (state.indoorIndex + 1) % CONFIG.indoorSamples.length;
		renderIndoor();
	}, CONFIG.indoorIntervalSeconds * 1000);
	if (CONFIG.autoRefreshMinutes > 0) setInterval(loadOutdoor, CONFIG.autoRefreshMinutes * 60 * 1000);
})();
