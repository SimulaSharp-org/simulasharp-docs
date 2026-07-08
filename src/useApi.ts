import { useEffect, useState } from "react";
import { loadApiModel, type ApiModel } from "./api";

let cache: Promise<ApiModel> | null = null;

/** Load the API model once (module-cached) and expose it to components. */
export function useApi() {
  const [model, setModel] = useState<ApiModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!cache) cache = loadApiModel();
    let live = true;
    cache.then((m) => live && setModel(m)).catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, []);
  return { model, error };
}
