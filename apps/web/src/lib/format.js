const STATUS = {
  notstarted: "Programado",
  inprogress: "En juego",
  finished: "Terminado",
  postponed: "Aplazado",
  canceled: "Cancelado",
  cancelled: "Cancelado",
  interrupted: "Interrumpido",
  suspended: "Suspendido",
  delayed: "Retrasado",
  abandoned: "Abandonado",
};

export function statusLabel(status) {
  if (!status) return "Sin estado";
  return STATUS[status.type] || status.description || "Sin estado";
}

export function flag(alpha2) {
  if (!alpha2 || alpha2.length !== 2) return "";
  return [...alpha2.toUpperCase()]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

export function clock(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function longDate(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function dayLabel(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, day));
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export function oddsText(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function choiceLabel(choice, match) {
  const name = String(choice?.name || "");
  if (!match) return name;
  if (name === "1") return match.home.shortName;
  if (name === "2") return match.away.shortName;
  if (name === "X") return "Empate";
  return name;
}

export function periodLabel(period) {
  const labels = { ALL: "Partido", "1ST": "1er set", "2ND": "2º set", "3RD": "3er set", "4TH": "4º set", "5TH": "5º set" };
  return labels[period] || period;
}

export function categoryTone(name) {
  const text = (name || "").toLowerCase();
  if (text.includes("wta")) return "wta";
  if (text.includes("atp")) return "atp";
  return "other";
}
