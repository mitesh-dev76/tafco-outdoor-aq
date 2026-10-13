(() => {
	"use strict";

	const CONFIG = window.AIR_CONFIG;
	const API = "https://air-quality-api.open-meteo.com/v1/air-quality";

	// India CPCB National AQI. Concentration breakpoints (µg/m³) per category;
	// the same index as CATEGORIES. Each category maps to an AQI range.
	const CATEGORIES = [
		{ aqi: [0, 50], label: "Good", color: "#00b050", ink: "#0b0b0c" },
		{ aqi: [51, 100], label: "Satisfactory", color: "#92d050", ink: "#0b0b0c" },
		{ aqi: [101, 200], label: "Moderate", color: "#ffff00", ink: "#0b0b0c" },
		{ aqi: [201, 300], label: "Poor", color: "#ff9900", ink: "#0b0b0c" },
		{ aqi: [301, 400], label: "Very poor", color: "#ff0000", ink: "#0b0b0c" },
		{ aqi: [401, 500], label: "Severe", color: "#c00000", ink: "#ffffff" },
	];
	const CPCB = {
		pm2_5: [[0, 30], [31, 60], [61, 90], [91, 120], [121, 250], [251, 380]],
		pm10: [[0, 50], [51, 100], [101, 250], [251, 350], [351, 430], [431, 510]],
	};

	const $ = (id) => document.getElementById(id);
	const root = document.documentElement;
	const state = { outdoor: null, fetchedAt: null, indoorIndex: 0, indoor: null };

	// ---------- helpers ----------
	function catIndex(key, v) {
		const i = CPCB[key].findIndex(([, hi]) => v < hi + 1);
		return i === -1 ? CATEGORIES.length - 1 : i;
	}
	// Category of a PM2.5 reading drives the label and colours.
	const bandFor = (pm25) => CATEGORIES[catIndex("pm2_5", pm25)];
	function subIndex(key, v) {
		const i = catIndex(key, v);
		const [blo, bhi] = CPCB[key][i];
		const [ilo, ihi] = CATEGORIES[i].aqi;
		return Math.min(500, ilo + ((ihi - ilo) * (Math.min(v, bhi) - blo)) / (bhi - blo));
	}
	// CPCB AQI = highest sub-index of the pollutants measured.
	const cpcbAqi = (r) => Math.round(Math.max(subIndex("pm2_5", r.pm2_5), r.pm10 != null ? subIndex("pm10", r.pm10) : 0));
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
		$("out-aqi").textContent = cpcbAqi(o);
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
	// Static outdoor cycle: rise through outdoorSamples, then fall back, one
	// step every outdoorIntervalSeconds. A midpoint is inserted between listed
	// values and each end is held one extra step, so 10 values fill 60 s each way.
	const OUT_STEPS = (() => {
		const v = CONFIG.outdoorSamples;
		const up = v.flatMap((x, i) => (i ? [(v[i - 1] + x) / 2, x] : [x]));
		return [...up, v[v.length - 1], ...up.slice().reverse(), v[0]];
	})();
	let outStep = 0;

	function loadOutdoor() {
		const pm2_5 = OUT_STEPS[outStep];
		outStep = (outStep + 1) % OUT_STEPS.length;
		state.outdoor = { pm2_5, pm10: pm2_5 * CONFIG.outdoorPm10Ratio, source: CONFIG.outdoorPlace.name };
		state.fetchedAt = new Date();
		document.querySelector(".live").classList.remove("off");
		renderOutdoor();
		renderIndoor();
	}

	/* Real outdoor data (WAQI station / Open-Meteo model), disabled for now.
	// WAQI reports pollutants as US AQI sub-indices; convert back to µg/m³.
	const AQI_STEPS = [0, 50, 100, 150, 200, 300, 500];
	const CONC_STEPS = {
		pm25: [0, 12, 35.4, 55.4, 150.4, 250.4, 500.4],
		pm10: [0, 54, 154, 254, 354, 424, 604],
	};
	function concFromAqi(aqi, key) {
		const c = CONC_STEPS[key];
		const i = Math.max(1, AQI_STEPS.findIndex((x) => aqi <= x));
		if (i === -1 || aqi > 500) return c[c.length - 1];
		const [a0, a1, c0, c1] = [AQI_STEPS[i - 1], AQI_STEPS[i], c[i - 1], c[i]];
		return c0 + ((aqi - a0) * (c1 - c0)) / (a1 - a0);
	}

	// A real monitoring station via WAQI (aqicn.org), when a token is set.
	async function fetchStation() {
		const s = CONFIG.station;
		const res = await fetch(`https://api.waqi.info/feed/${s.id}/?token=${encodeURIComponent(s.token)}`);
		const json = await res.json();
		if (json.status !== "ok" || !json.data.iaqi?.pm25) throw new Error(`Station feed: ${json.data ?? "no PM2.5"}`);
		const d = json.data;
		return {
			pm2_5: concFromAqi(d.iaqi.pm25.v, "pm25"),
			pm10: d.iaqi.pm10 ? concFromAqi(d.iaqi.pm10.v, "pm10") : null,
			source: d.city?.name ?? "Station",
			measuredAt: d.time?.s,
		};
	}

	// Modelled data from Open-Meteo (CAMS), used as fallback.
	async function fetchModel() {
		const p = CONFIG.outdoorPlace;
		const res = await fetch(`${API}?latitude=${p.latitude}&longitude=${p.longitude}&current=pm2_5,pm10&timezone=auto`);
		if (!res.ok) throw new Error(`Air quality service returned ${res.status}`);
		const json = await res.json();
		return { ...json.current, source: "Open-Meteo model" };
	}

	async function loadOutdoor() {
		try {
			let data;
			if (CONFIG.station?.token) {
				try { data = await fetchStation(); } catch (err) { console.warn(err); }
			}
			data ??= await fetchModel();
			state.outdoor = data;
			state.fetchedAt = new Date();
			document.querySelector(".live").classList.remove("off");
			renderOutdoor();
			renderIndoor();
		} catch (err) {
			console.error(err);
			document.querySelector(".live").classList.add("off");
			if (!state.outdoor) $("out-badge").textContent = "Offline";
		}
	}

	*/

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
	tickClock();
	setInterval(tickClock, 1000);
	renderIndoor();
	loadOutdoor();
	setInterval(() => {
		state.indoorIndex = (state.indoorIndex + 1) % CONFIG.indoorSamples.length;
		renderIndoor();
	}, CONFIG.indoorIntervalSeconds * 1000);
	setInterval(loadOutdoor, CONFIG.outdoorIntervalSeconds * 1000);
})();
