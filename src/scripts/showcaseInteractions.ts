export function initShowcaseInteractions(): void {
  const root = document.getElementById("theme-showcase");
  if (!root) return;

  const toast = root.querySelector(".toast");

  const showToast = (text: string) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("isVisible");
    window.clearTimeout((showToast as { _t?: number })._t);
    (showToast as { _t?: number })._t = window.setTimeout(
      () => toast.classList.remove("isVisible"),
      1200,
    );
  };

  root.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const printBtn = target.closest("[data-print]");
    if (printBtn) {
      window.print();
      return;
    }

    const btn = target.closest("[data-copy]");
    if (!btn) return;

    const hexNode = btn.querySelector(".swatchHex[data-value]");
    const tokenNode = btn.querySelector(".swatchToken");
    const displayedHex = hexNode?.textContent?.trim() || "";
    const hasDetected =
      displayedHex.length > 0 && displayedHex !== "—" && displayedHex !== "N/A";
    const toCopy = hasDetected
      ? displayedHex
      : btn.getAttribute("data-copy") || tokenNode?.textContent?.trim() || "";

    try {
      await navigator.clipboard.writeText(toCopy);
      showToast(`Copiado: ${toCopy}`);
    } catch {
      showToast("No se pudo copiar");
    }
  });
}
