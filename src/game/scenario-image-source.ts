import scripted from "../data/scripted-scenario-art.json";
import reference from "../data/reference-scenario-art.json";

// Data-only source mapping avoids a runtime dependency on the card registry.
export const cachedImageSource = (source: string | undefined) =>
  scripted[source as keyof typeof scripted] ??
  reference[source as keyof typeof reference] ??
  source;
