export async function getJson(pathname) {
  const response = await fetch(pathname, { cache: "no-store" });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar la información.");
  }
  return payload;
}
