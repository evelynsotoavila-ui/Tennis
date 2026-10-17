import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "./env.js";

export class ClaudeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ClaudeError";
    this.status = status;
  }
}

export function assertClaudeConfigured() {
  if (!ANTHROPIC_API_KEY) {
    throw new ClaudeError(
      "Falta la clave de Claude. Agrégala en .env como CALUDE_API_KEY o ANTHROPIC_API_KEY.",
      503,
    );
  }
}

export async function completeText(system, user) {
  assertClaudeConfigured();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const upstream = typeof body?.error?.message === "string" ? body.error.message : "";
    if (response.status === 401 || response.status === 403) {
      throw new ClaudeError("Claude rechazó la clave.", 502);
    }
    if (/credit balance|billing|purchase credits/i.test(upstream)) {
      throw new ClaudeError("La cuenta de Claude no tiene crédito. Recarga el plan en Anthropic y vuelve a intentar.", 402);
    }
    if (response.status === 429) {
      throw new ClaudeError("Claude limitó las consultas. Espera un momento.", 429);
    }
    throw new ClaudeError("Claude no pudo generar el pronóstico.", 502);
  }

  const text = (body.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new ClaudeError("Claude no devolvió texto.", 502);
  return text;
}
