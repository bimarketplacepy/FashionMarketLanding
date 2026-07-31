// Borrador del outfit que se está armando: compartido entre la ficha de
// producto ("Agregar a mi outfit"), el tab Outfits y la página /outfit.
const DRAFT_KEY = "outfit-builder-draft-v1";

export function readDraft() {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function addToDraft(item) {
  const draft = readDraft();
  draft[item.part] = { id: item.id };
  writeDraft(draft);
  return draft;
}

export function draftFromOutfit(outfit, items) {
  const draft = {};
  for (const id of outfit.garmentIds || []) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) draft[item.part] = { id: item.id };
  }
  return draft;
}
